import { bytesToInteger, decodeAuthToken } from "../../utils";
import {
  Blockchain,
  buildDIDType,
  DID,
  DidMethod,
  NetworkId,
} from "@iden3/js-iden3-core";
import {
  byteDecoder,
  byteEncoder,
  buildDIDFromEthAddress,
  KMS,
  KmsKeyId,
  JWSPacker,
  KmsKeyType,
  SignerFn,
  IEthereumWallet,
  bytesToHex,
} from "@0xpolygonid/js-sdk";
import { DIDResolutionResult } from "did-resolver";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generates a cryptographically secure random Unix timestamp within a
 * ±60 second window around the current time.
 *
 * 1. Generate Cryptographically Secure Random Bytes
 * If the number of bits isn’t a multiple of 8, the most significant bits are masked to avoid values outside the range.
 * This technique avoids "modulo bias", which can occur when using basic `Math.random()`.
 *
 * 2. The random bytes are converted to an integer using `bytesToInteger()`.
 * If the number is outside the valid range (≥ `range`), new bytes are generated.
 * This retry loop ensures a **uniform distribution** across the entire range.
 *
 * 3. The final value is a Unix timestamp in seconds within `[now - 60, now + 60]`.
 *
 * @returns {number} A random Unix timestamp (in seconds) within the 120-second window.
 */
export function generateChallenge(): number {
  const windowSize = 60;
  const now = Math.floor(Date.now() / 1000);
  const min = now - windowSize;
  const max = now + windowSize;
  const range = max - min;

  const bitLength = (range - 1).toString(2).length;
  const shift = bitLength % 8;
  const bytes = new Uint8Array(Math.ceil(bitLength / 8));

  let result: number;

  do {
    crypto.getRandomValues(bytes);
    if (shift !== 0) {
      bytes[0] &= (1 << shift) - 1;
    }
    result = bytesToInteger(bytes);
  } while (result >= range);

  return min + result;
}

/**
 * Generate JWS with payload of challenge and did
 *
 * @param kms
 * @param keyId
 * @param payload
 * @param didDoc
 * @param signer
 */
export async function packDIDChallenge(
  kms: KMS,
  keyId: KmsKeyId,
  payload: { did: string; challenge: number },
  didDoc: any,
  opts?: any
): Promise<string> {
  const resolveDIDDocument: {
    resolve: (did: string) => Promise<DIDResolutionResult>;
  } = {
    resolve: () =>
      Promise.resolve({ didDocument: didDoc } as DIDResolutionResult),
  };
  const jws = new JWSPacker(kms, resolveDIDDocument);
  const bodyMsgStr = `{"from": "${payload.did}", "challenge": "${payload.challenge}"}`;
  const bodyMsgStrRecovery = JSON.parse(bodyMsgStr);
  bodyMsgStrRecovery.from = payload.did;
  const msgBytes = byteEncoder.encode(JSON.stringify(bodyMsgStrRecovery));

  const signer: SignerFn = async (_, data) => {
    return kms.sign(keyId, data, opts);
  };

  const token = await jws.pack(msgBytes, {
    alg: "ES256K-R",
    did: payload.did,
    issuer: payload.did,
    keyType: keyId.type,
    signer: signer,
  });
  return byteDecoder.decode(token);
}

/**
 * Generate JWS with payload of challenge and response
 *
 * @param kms
 * @param keyId
 * @param payload
 * @param didDoc
 * @param signer
 */
export async function packResponseArtifactsChallenge(
  kms: KMS,
  keyId: KmsKeyId,
  payload: any,
  didDoc: any,
  opts?: any
): Promise<string> {
  const resolveDIDDocument: {
    resolve: (did: string) => Promise<DIDResolutionResult>;
  } = {
    resolve: () =>
      Promise.resolve({ didDocument: didDoc } as DIDResolutionResult),
  };

  const jws = new JWSPacker(kms, resolveDIDDocument);
  const bodyMsgStr = `{"from": "${payload.did}", "artifacts": "0x${bytesToHex(
    byteEncoder.encode(JSON.stringify(payload))
  )}", "challenge": "${payload.challenge}"}`;
  const bodyMsgStrRecovery = JSON.parse(bodyMsgStr);
  bodyMsgStrRecovery.from = payload.did;
  const msgBytes = byteEncoder.encode(JSON.stringify(bodyMsgStrRecovery));

  const signer: SignerFn = async (_, data) => {
    return kms.sign(keyId, data, opts);
  };

  const token = await jws.pack(msgBytes, {
    alg: "ES256K-R",
    did: payload.did,
    issuer: payload.did,
    keyType: keyId.type,
    signer: signer,
  });
  const packedToken = byteDecoder.decode(token);
  const jwsParts = packedToken.split(".");

  // Return JWS Detached format
  return jwsParts[0] + ".." + jwsParts[2];
}

export async function signTypedData(signer: any, data: any) {
  return signer.signTypedData(data.domain, data.types, data.message);
}

/**
 * Creates ETH based DID
 *
 * @param ethAddress The Ethereum address
 */
export function createDefaultDid(ethAddress: string): DID {
  const didType = buildDIDType(
    DidMethod.Iden3,
    Blockchain.Billions,
    NetworkId.Test
  );

  return buildDIDFromEthAddress(didType, ethAddress);
}

/**
 * Function to create a DID Document for an agent using an Ethereum address.
 * This document will be used to sign data and later for verification.
 *
 * @param did
 * @param address
 */
export const createDidDoc = (did: string, address: string) => ({
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
  ],
  id: did,
  verificationMethod: [
    {
      id: `${did}#vm-1`,
      controller: did,
      type: "EcdsaSecp256k1RecoveryMethod2020",
      ethereumAddress: address,
    },
  ],
  authentication: [`${did}#vm-1`],
});

export async function checkOwnerAuthToken(payload: {
  signedToken: string;
  did: string;
  ethAddress: string;
}): Promise<void> {
  const decodedPayload = await decodeAuthToken(payload.signedToken, {
    did: payload.did,
    address: payload.ethAddress,
  });
  if (!decodedPayload?.from) {
    throw new Error("Missing required field: 'from' in decoded payload");
  }

  if (!decodedPayload?.challenge) {
    throw new Error("Missing required field: 'challenge' in decoded payload");
  }

  const challenge = Math.floor(Date.now() / 1000);

  // 5 minutes validity
  if (decodedPayload.challenge + 300 < challenge) {
    throw new Error("Challenge is expired");
  }
}

export async function packOwnerAuthDid(
  kms: KMS,
  keyType: KmsKeyType,
  didConfig: { method: string; blockchain: string; network: string },
  challenge: number,
  wallet: IEthereumWallet
) {
  const { ethAddress, did, keyId } = await getKeyInfoFromKMS(
    kms,
    keyType,
    didConfig,
    wallet
  );

  const didDoc = createDidDoc(did.string(), ethAddress);
  const resolveDIDDocument: {
    resolve: (did: string) => Promise<DIDResolutionResult>;
  } = {
    resolve: () =>
      Promise.resolve({ didDocument: didDoc } as DIDResolutionResult),
  };

  const jws = new JWSPacker(kms, resolveDIDDocument);

  const bodyMsgStr = `{"from": "${did}", "challenge": ${challenge}}`;
  const bodyMsgStrRecovery = JSON.parse(bodyMsgStr);
  bodyMsgStrRecovery.from = did;
  const msgBytes = byteEncoder.encode(JSON.stringify(bodyMsgStrRecovery));

  const signer: SignerFn = async (_, data) => {
    return kms.sign(keyId, data);
  };

  const token = await jws.pack(msgBytes, {
    alg: "ES256K-R",
    did,
    issuer: did,
    signer: signer,
  });

  return byteDecoder.decode(token);
}

export async function getLastKeyFromKMS(kms: KMS, keyType: KmsKeyType) {
  const existingKeys = await kms.list(keyType);
  if (!existingKeys || existingKeys.length === 0) {
    throw new Error(`No keys found for key type: ${keyType}`);
  }
  const lastKey = existingKeys.at(-1);
  if (!lastKey) {
    throw new Error("No existing key found in keyProvider list.");
  }
  const keyId = { id: lastKey.alias, type: keyType };
  return keyId;
}

export async function getKeyInfoFromKMS(
  kms: KMS,
  keyType: KmsKeyType,
  didConfig: { method: string; blockchain: string; network: string },
  wallet: IEthereumWallet
) {
  const keyId = await getLastKeyFromKMS(kms, keyType);

  const ethAddress = await wallet.getEthAddress(keyId);

  const didType = buildDIDType(
    didConfig.method,
    didConfig.blockchain,
    didConfig.network
  );
  const did = buildDIDFromEthAddress(didType, ethAddress);
  const id = DID.idFromDID(did);

  return { keyId, ethAddress, did, id };
}
