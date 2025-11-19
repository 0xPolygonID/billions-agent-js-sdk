import { registerAgentInMemorySecp256k1KMS } from "../../src/utils/kms-helper";
import { DIDResolutionResult } from "did-resolver";
import {
  byteEncoder,
  JWSPacker,
  KmsKeyType,
  SignerFn,
} from "@0xpolygonid/js-sdk";
import { createDefaultDid, createDidDoc } from "../../src/agentkit/func-utils";
import { getRandomBytes } from "@iden3/js-crypto";
import { describe, it } from "vitest";
import { EthereumWallet } from "../../src/agentkit";

describe("JWS", async () => {
  const signAndUnpack = async (
    kms: ReturnType<typeof registerAgentInMemorySecp256k1KMS>,
    keyType: KmsKeyType,
    options: { seed: Uint8Array }
  ) => {
    const lastKey = await kms.createKeyFromSeed(keyType, options.seed);
    const wallet = new EthereumWallet("http://localhost:8545", kms);
    const address = await wallet.getEthAddress(lastKey);
    const did = createDefaultDid(address).string();

    const didDoc = createDidDoc(did, address);
    const resolveDIDDocument: {
      resolve: (did: string) => Promise<DIDResolutionResult>;
    } = {
      resolve: () =>
        Promise.resolve({ didDocument: didDoc } as DIDResolutionResult),
    };

    const jws = new JWSPacker(kms, resolveDIDDocument);

    const bodyMsgStr = `{"from": "${did}", "challenge": "1"}`;
    const bodyMsgStrRecovery = JSON.parse(bodyMsgStr);
    bodyMsgStrRecovery.from = did;
    const msgBytes = byteEncoder.encode(JSON.stringify(bodyMsgStrRecovery));

    const signer: SignerFn = async (_, data) => {
      return kms.sign(lastKey, data, { seed: options.seed });
    };

    const packed = await jws.pack(msgBytes, {
      alg: "ES256K-R",
      did,
      issuer: did,
      keyType,
      signer: signer,
    });

    return await jws.unpack(packed);
  };

  it("Should sign and verify JWS using local KMS", async () => {
    const kms = registerAgentInMemorySecp256k1KMS();
    await signAndUnpack(kms, KmsKeyType.Secp256k1, {
      seed: getRandomBytes(32),
    });
  });
});
