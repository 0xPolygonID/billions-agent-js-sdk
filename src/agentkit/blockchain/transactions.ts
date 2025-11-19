import {
  IEthereumWallet,
  KMS,
  KmsKeyId,
  KmsKeyType,
} from "@0xpolygonid/js-sdk";
import attestationRegistryABI from "./abi/AttestationRegistry.json";
import authVerifierABI from "./abi/AuthVerifier.json";
import {
  AttestationData,
  BlockchainConfig,
  DidAuthAttestation,
  OwnershipAttestation,
} from "../types";
import { DID, Id } from "@iden3/js-iden3-core";
import { ethers, TransactionRequest } from "ethers";
import { getLastKeyFromKMS } from "../func-utils";

const maxGasLimit = 10000000n;

/**
 * Sends a did auth attestation from the agent response to the attestation registry.
 * This function will first authenticate the agent to the attestation registry if not already authenticated.
 * @param {KMS} kms - The Key Management System instance.
 * @param {KmsKeyType} keyType - The type of key used in the KMS.
 * @param {DidAuthAttestation} didAuthAttestation - The did auth attestation data to be sent.
 * @param {BlockchainConfig} blockchainConfig - The blockchain configuration including RPC URL and contract addresses.
 * @param {any} opts - Optional parameters.
 * @returns {bigint,string} the attestation ID created in the attestation registry and the txHash of the transaction.
 */
export async function sendDidAuthAttestation(
  kms: KMS,
  keyType: KmsKeyType,
  didAuthAttestation: DidAuthAttestation,
  blockchainConfig: BlockchainConfig,
  wallet: IEthereumWallet,
  opts?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ attestationId: string; txHash: string }> {
  const currentUserId = await authenticateToAttestationRegistry(
    kms,
    keyType,
    blockchainConfig,
    BigInt(didAuthAttestation.agentId),
    didAuthAttestation.agentAddress,
    wallet,
    opts
  );

  if (!currentUserId) {
    throw new Error(
      "User authentication of agent to attestation registry failed."
    );
  }

  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "string", "address", "uint256", "string"],
    [
      didAuthAttestation.agentId,
      didAuthAttestation.agentDomain,
      didAuthAttestation.agentAddress,
      didAuthAttestation.challenge,
      didAuthAttestation.signedToken,
    ]
  );

  const attesterDid = DID.parseFromId(
    Id.fromBigInt(BigInt(didAuthAttestation.agentId))
  ).string();

  const attestationData = {
    schemaId: blockchainConfig.agentDidAuthSchemaId,
    attester: {
      did: attesterDid,
      iden3Id: BigInt(didAuthAttestation.agentId),
      ethereumAddress: didAuthAttestation.agentAddress,
    },
    recipient: {
      did: attesterDid,
      iden3Id: BigInt(didAuthAttestation.agentId),
      ethereumAddress: didAuthAttestation.agentAddress,
    },
    expirationTime: 0, // No expiration
    revocable: true,
    refId: ethers.ZeroHash,
    data: encodedData,
  };

  return sendAttestation(
    kms,
    keyType,
    blockchainConfig,
    attestationData,
    wallet,
    opts
  );
}

export async function sendOwnershipAttestation(
  kms: KMS,
  keyType: KmsKeyType,
  ownershipAttestation: OwnershipAttestation,
  blockchainConfig: BlockchainConfig,
  wallet: IEthereumWallet,
  opts?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ attestationId: string; txHash: string }> {
  const currentUserId = await authenticateToAttestationRegistry(
    kms,
    keyType,
    blockchainConfig,
    BigInt(ownershipAttestation.agentId),
    ownershipAttestation.agentAddress,
    wallet,
    opts
  );

  if (!currentUserId) {
    throw new Error(
      "User authentication of agent to attestation registry failed."
    );
  }

  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes"],
    ["0x"]
  );

  const attesterDid = DID.parseFromId(
    Id.fromBigInt(BigInt(ownershipAttestation.agentId))
  ).string();
  const recipientDid = DID.parseFromId(
    Id.fromBigInt(BigInt(ownershipAttestation.ownerId))
  ).string();

  const attestationData = {
    schemaId: blockchainConfig.agentOwnershipSchemaId,
    attester: {
      did: attesterDid,
      iden3Id: BigInt(ownershipAttestation.agentId),
      ethereumAddress: ownershipAttestation.agentAddress,
    },
    recipient: {
      did: recipientDid,
      iden3Id: BigInt(ownershipAttestation.ownerId),
      ethereumAddress: ethers.ZeroAddress,
    },
    expirationTime: 0, // No expiration
    revocable: true,
    refId: ethers.ZeroHash,
    data: encodedData,
  };

  return sendAttestation(
    kms,
    keyType,
    blockchainConfig,
    attestationData,
    wallet,
    opts
  );
}

async function sendTransaction(
  wallet: IEthereumWallet,
  request: TransactionRequest,
  keyId: KmsKeyId,
  opts?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ txnHash: string; txnReceipt: ethers.TransactionReceipt }> {
  let gasLimit;
  try {
    gasLimit = await wallet.estimateGas(keyId, request, opts);
  } catch (e) {
    gasLimit = maxGasLimit;
  }
  request.gasLimit = gasLimit;

  const txnReceipt = await wallet.sendTransaction(keyId, request, opts);
  if (!txnReceipt) {
    throw Error("No transaction created");
  }

  return { txnHash: txnReceipt.hash, txnReceipt };
}

export async function sendAttestation(
  kms: KMS,
  keyType: KmsKeyType,
  blockChainConfig: BlockchainConfig,
  attestationData: AttestationData,
  wallet: IEthereumWallet,
  opts?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ attestationId: string; txHash: string }> {
  const provider = new ethers.JsonRpcProvider(blockChainConfig.rpcUrl);
  const feeData = await provider.getFeeData();
  const maxFeePerGas = blockChainConfig.maxFeePerGas
    ? BigInt(blockChainConfig.maxFeePerGas)
    : feeData.maxFeePerGas;
  const maxPriorityFeePerGas = blockChainConfig.maxPriorityFeePerGas
    ? BigInt(blockChainConfig.maxPriorityFeePerGas)
    : feeData.maxPriorityFeePerGas;

  const attestationRegistry = new ethers.Contract(
    blockChainConfig.attestationRegistryAddress,
    attestationRegistryABI,
    provider
  );

  const payload =
    await attestationRegistry.recordAttestation.populateTransaction(
      attestationData
    );

  const request: TransactionRequest = {
    to: blockChainConfig.attestationRegistryAddress,
    data: payload.data,
    maxFeePerGas: maxFeePerGas as bigint,
    maxPriorityFeePerGas: maxPriorityFeePerGas as bigint,
  };

  const { txnHash, txnReceipt } = await sendTransaction(
    wallet,
    request,
    await getLastKeyFromKMS(kms, keyType),
    opts
  );

  if (!txnReceipt) {
    throw new Error("Attestation transaction failed");
  }
  if (!txnReceipt.logs || txnReceipt.logs.length === 0) {
    throw new Error("No logs found for Attestation transaction");
  }
  const attestationId = txnReceipt.logs[0].topics[1] as string;
  return { attestationId, txHash: txnHash };
}

export async function authenticateToAttestationRegistry(
  kms: KMS,
  keyType: KmsKeyType,
  blockChainConfig: BlockchainConfig,
  agentId: bigint,
  agentAddress: string,
  wallet: IEthereumWallet,
  opts?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(blockChainConfig.rpcUrl);
  const feeData = await provider.getFeeData();
  const maxFeePerGas = blockChainConfig.maxFeePerGas
    ? BigInt(blockChainConfig.maxFeePerGas)
    : feeData.maxFeePerGas;
  const maxPriorityFeePerGas = blockChainConfig.maxPriorityFeePerGas
    ? BigInt(blockChainConfig.maxPriorityFeePerGas)
    : feeData.maxPriorityFeePerGas;

  const authVerifier = new ethers.Contract(
    blockChainConfig.authVerifierAddress,
    authVerifierABI,
    provider
  );

  let currentUserId = await authVerifier.getIdByAddress(agentAddress);

  if (currentUserId === 0n) {
    // First, we need to authenticate with the AuthVerifier
    // Create an auth response with ethIdentity method, which AuthVerifier will recognize
    const authResponse = {
      authMethod: "ethIdentity",
      proof: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [agentId]),
    };

    // Check if authVerifier is properly configured
    try {
      // First we need to check if the ethIdentity method is registered
      const authMethodExists = await authVerifier.authMethodExists(
        "ethIdentity"
      );
      if (!authMethodExists) {
        throw new Error("ethIdentity auth method not found");
      }

      const payload = await authVerifier.submitResponse.populateTransaction(
        authResponse,
        [], // Empty responses array
        "0x" // Empty cross chain proofs
      );

      const request: TransactionRequest = {
        to: blockChainConfig.authVerifierAddress,
        data: payload.data,
        maxFeePerGas: maxFeePerGas as bigint,
        maxPriorityFeePerGas: maxPriorityFeePerGas as bigint,
        gasLimit: maxGasLimit,
      };

      await sendTransaction(
        wallet,
        request,
        await getLastKeyFromKMS(kms, keyType),
        opts
      );

      // Verify authentication worked
      currentUserId = await authVerifier.getIdByAddress(agentAddress);

      if (currentUserId === 0n) {
        throw new Error(
          "Authentication failed - user ID is still 0 after authentication"
        );
      }
    } catch (authError) {
      throw new Error(`Could not authenticate: ${authError}`);
    }
  } else {
    // Use the existing user ID from the AuthVerifier
    if (currentUserId.toString() !== agentId.toString()) {
      throw new Error(
        `Authenticated user ID ${currentUserId} does not match the agent ID ${agentId}. Please ensure the agent is using the correct Ethereum address.`
      );
    }
  }

  return currentUserId;
}

export async function getOwnershipAttestationFromOwner(
  txHash: string,
  blockChainConfig: BlockchainConfig
): Promise<OwnershipAttestation> {
  const provider = new ethers.JsonRpcProvider(blockChainConfig.rpcUrl);

  const attestationRegistry = new ethers.Contract(
    blockChainConfig.attestationRegistryAddress,
    attestationRegistryABI,
    provider
  );

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error("Ownership transaction not found");
  }
  const result = await tx.wait();
  if (!result || !result.logs || result.logs.length === 0) {
    throw new Error("No logs found for Ownership transaction");
  }
  const attestationId = result.logs[0].topics[1];

  const attestation = await attestationRegistry.getAttestation(attestationId);

  const ownershipAttestation: OwnershipAttestation = {
    agentId: attestation.recipient.iden3Id.toString(),
    agentAddress: attestation.recipient.ethereumAddress,
    ownerId: attestation.attester.iden3Id.toString(),
  };

  return ownershipAttestation;
}
