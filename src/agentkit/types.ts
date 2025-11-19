import { BasicMessage, IEthereumWallet, KmsKeyType } from "@0xpolygonid/js-sdk";

export enum ResponseFormat {
  Content = "Content",
  ContentAndArtifact = "content_and_artifact",
}

export type ResponseChallengePayload = {
  ethAddress: string;
  did: string;
  challenge: number;
  response: string;
  signedResponseToken: string;
};

export type GenerateKeysPayLoad = ResponseChallengePayload;
export type SetOwnershipPayload = ResponseChallengePayload;
export type ProveReputationPayload = ResponseChallengePayload;

export type AuthDidPayload = ResponseChallengePayload & {
  domain: string;
  keyType: KmsKeyType;
  signedDidAuthToken: string;
  txHash?: string;
};

export type ProveOwnerPayload = ResponseChallengePayload & {
  domain: string;
  ownerId: string;
  txHashAgentAttestation: string;
  txHashOwnerAttestation: string;
};

export interface OwnershipAttestation {
  agentId: string;
  agentAddress: string;
  ownerId: string;
}

export interface DidAuthAttestation {
  agentId: string;
  agentDomain: string;
  agentAddress: string;
  challenge: string;
  signedToken: string;
}

export type AgentBasicMessage = BasicMessage & {
  challenge: number;
  artifacts: string;
};

export interface Config {
  keyType: KmsKeyType;
  ownerId: bigint;
  ownerAddress: string;
  txDidAuthAttestation?: string;
  txOwnershipAttestationFromAgent?: string;
  txOwnershipAttestationFromOwner?: string;
  agentDomain: string;
  didConfig: {
    method: string;
    blockchain: string;
    network: string;
  };
  wallet: IEthereumWallet;
  blockchainConfig?: BlockchainConfig;
  attestationServiceConfig?: AttestationServiceConfig;
  seed?: Uint8Array;
}

export interface BlockchainConfig {
  rpcUrl: string;
  blockExplorerUrl: string;
  authVerifierAddress: string;
  attestationRegistryAddress: string;
  agentDidAuthSchemaId: string;
  agentOwnershipSchemaId: string;
  reviewSchemaId: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface AttestationServiceConfig {
  apiUrl: string;
  explorerUrl: string;
  pageSize?: number;
}

export interface AttestationData {
  schemaId: string;
  attester: { did: string; iden3Id: bigint; ethereumAddress: string };
  recipient: { did: string; iden3Id: bigint; ethereumAddress: string };
  expirationTime: number;
  revocable: boolean;
  refId: string;
  data: string;
}
