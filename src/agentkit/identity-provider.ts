import {
  AuthTokenInputSchema,
  ChallengeInputSchema,
  checkOwnerAuthToken,
  createDidDoc,
  CreateFunction,
  getKeyInfoFromKMS,
  OwnershipMessageSchema,
  packDIDChallenge,
  packResponseArtifactsChallenge,
} from "./func-utils";
import { ActionProvider } from "./action-provider";
import {
  AuthDidPayload,
  Config,
  DidAuthAttestation,
  GenerateKeysPayLoad,
  OwnershipAttestation,
  ProveOwnerPayload,
  ProveReputationPayload,
  ResponseFormat,
  SetOwnershipPayload,
} from "./types";
import { z } from "zod";
import { DID, Id } from "@iden3/js-iden3-core";
import { KMS, KmsKeyId } from "@0xpolygonid/js-sdk";
import { ethers } from "ethers";
import {
  getOwnershipAttestationFromOwner,
  sendDidAuthAttestation,
  sendOwnershipAttestation,
} from "./blockchain";
import { getReviewAttestationsInfo } from "./attestations/attestations";

export class IdentityProvider extends ActionProvider {
  /**
   * Initializes the identity provider.
   */
  constructor(kms: KMS, config: Config) {
    super(kms, config);
  }

  /**
   * Generate keys for attestation.
   *
   * @returns The ETH address with public key from generated key pair.
   */
  @CreateFunction({
    name: "request_generate_keys",
    description: `This tool will request agent Ethereum address with public key and either generate a new DID (Decentralized Identifier) based on the Ethereum address`,
    schema: AuthTokenInputSchema,
    response_format: ResponseFormat.ContentAndArtifact,
  })
  async generateKeys(
    kms: KMS,
    config: Config,
    args: z.infer<typeof AuthTokenInputSchema>
  ) {
    let keyRef: KmsKeyId;

    await checkOwnerAuthToken({
      signedToken: args.authToken,
      did: DID.parseFromId(Id.fromBigInt(config.ownerId)).string(),
      ethAddress: config.ownerAddress,
    });

    const keyProvider = kms.getKeyProvider(config.keyType);
    if (!keyProvider) {
      throw new Error(`keyProvider not found for: ${config.keyType}`);
    }
    const existingKeys = await keyProvider.list();
    const keyExists = existingKeys.length !== 0;

    if (keyExists) {
      const lastKey = existingKeys.at(-1);
      if (!lastKey) {
        throw new Error("No existing key found in keyProvider list.");
      }
      keyRef = { id: lastKey.alias, type: config.keyType };
    } else {
      if (!config.seed) {
        throw new Error("Seed is required to generate new key");
      }
      keyRef = await kms.createKeyFromSeed(config.keyType, config.seed);
    }

    const [publicKey, ethAddress] = await Promise.all([
      kms.publicKey(keyRef),
      config.wallet.getEthAddress(keyRef),
    ]);

    const { keyId, did, id } = await getKeyInfoFromKMS(
      kms,
      config.keyType,
      config.didConfig,
      config.wallet
    );

    let balance = 0n;
    if (config.blockchainConfig?.rpcUrl && ethAddress) {
      const provider = new ethers.JsonRpcProvider(
        config.blockchainConfig?.rpcUrl ?? ""
      );
      balance = await provider.getBalance(ethAddress);
    }

    config.txOwnershipAttestationFromAgent = undefined;
    config.txOwnershipAttestationFromOwner = undefined;
    config.txDidAuthAttestation = undefined;

    const response = `Successfully generate Ethereum address and public key. Decentralized Identifier (DID) successfully generated for my Ethereum-based identity.

        - **Ethereum Address:** ${ethAddress}
        - **Public Key:** ${publicKey}
        - **DID:** ${did.string()}
        - **Id:** ${id.bigInt().toString()}
        - **Domain:** ${config.agentDomain}
        - **Balance:** ${ethers.formatEther(balance)} ETH

        These credentials were generated using Key Management System with the ${
          config.keyType
        } key type.
        This DID was generated using the Ethereum Identity from my Ethereum Address using Billions framework.`;

    const didDoc = createDidDoc(did.string(), ethAddress);
    const payload: GenerateKeysPayLoad = {
      did: did.string(),
      ethAddress: ethAddress,
      challenge: args.challenge,
      response: response,
      signedResponseToken: "",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signedResponseToken, ...parsedResponsePayload } = payload;
    const signedResponseArtifactsToken = await packResponseArtifactsChallenge(
      kms,
      keyId,
      parsedResponsePayload,
      didDoc,
      {
        seed: config.seed,
      }
    );
    payload.signedResponseToken = signedResponseArtifactsToken;

    return [response, payload];
  }

  /**
   * Prove did using JWS
   *
   * @returns The response that contains JWS, DID, ethAddress
   */
  @CreateFunction({
    name: "request_prove_did",
    description: `This tool instructs the agent to cryptographically prove its Decentralized Identifier (DID) based on its associated Ethereum address.
        This function is invoked **after** the 'request_generate_keys' function to ensure the necessary cryptographic keys are available.
        It is triggered when the user explicitly asks the agent to provide a proof of its DID or requests authentication of its identity, such as through phrases like "Prove your DID," "Authenticate your DID," or "Provide a verifiable form of your DID."`,
    schema: ChallengeInputSchema,
    response_format: ResponseFormat.ContentAndArtifact,
  })
  async proveDid(
    kms: KMS,
    config: Config,
    args: z.infer<typeof ChallengeInputSchema>
  ) {
    const { keyId, ethAddress, did, id } = await getKeyInfoFromKMS(
      kms,
      config.keyType,
      config.didConfig,
      config.wallet
    );

    const didDoc = createDidDoc(did.string(), ethAddress);
    const parsedDidAuthPayload = {
      did: did.string(),
      challenge: args.challenge,
    };
    const signedDidAuthToken = await packDIDChallenge(
      kms,
      keyId,
      parsedDidAuthPayload,
      didDoc,
      {
        seed: config.seed,
      }
    );

    const payload: AuthDidPayload = {
      did: did.string(),
      domain: config.agentDomain,
      challenge: args.challenge,
      signedResponseToken: "",
      signedDidAuthToken,
      ethAddress,
      keyType: config.keyType,
      response: "",
    };

    let balance = 0n;

    if (
      config.blockchainConfig &&
      config.blockchainConfig?.rpcUrl &&
      ethAddress &&
      !config.txDidAuthAttestation
    ) {
      const provider = new ethers.JsonRpcProvider(
        config.blockchainConfig?.rpcUrl ?? ""
      );
      balance = await provider.getBalance(ethAddress);

      if (balance === 0n) {
        throw new Error(
          `Insufficient balance in agent Ethereum address ${ethAddress} to send DID Auth attestation transaction. Please fund the address with testnet ETH.`
        );
      }

      const didAuthAttestation: DidAuthAttestation = {
        agentId: id.bigInt().toString(),
        agentDomain: config.agentDomain,
        agentAddress: ethAddress,
        challenge: args.challenge.toString(),
        signedToken: signedDidAuthToken,
      };

      const result = await sendDidAuthAttestation(
        kms,
        config.keyType,
        didAuthAttestation,
        config.blockchainConfig,
        config.wallet,
        { seed: config.seed }
      );
      payload.txHash = result.txHash;
      config.txDidAuthAttestation = result.txHash;

      // Update balance after sending the transaction
      balance = await provider.getBalance(ethAddress);
    }

    const response = `Decentralized Identifier (DID) successfully generated for my Ethereum-based identity.

        - **DID:** ${did.string()}
        - **Id:** ${id.bigInt().toString()}
        - **Domain:** ${config.agentDomain}
        - **Ethereum Address:** ${ethAddress}
        - **Balance:** ${ethers.formatEther(balance)} ETH
        - **Tx Hash of DID Auth Attestation:** ${
          config.txDidAuthAttestation ?? "N/A"
        }

        A challenge was signed to confirm that I have authenticated DID over my identity: ${signedDidAuthToken}
  ${
    config.blockchainConfig && config.txDidAuthAttestation
      ? "DID Auth Attestation could be verified on-chain using this link:" +
        config.blockchainConfig.blockExplorerUrl +
        "/tx/" +
        config.txDidAuthAttestation
      : ""
  }`;
    payload.response = response;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signedResponseToken, ...parsedResponsePayload } = payload;
    const signedResponseArtifactsToken = await packResponseArtifactsChallenge(
      kms,
      keyId,
      parsedResponsePayload,
      didDoc,
      {
        seed: config.seed,
      }
    );
    payload.signedResponseToken = signedResponseArtifactsToken;

    return [response, payload];
  }

  /**
   * Prove owner using ownership attestation
   *
   * @returns The response that contains ownership attestation transaction, DID, ethAddress
   */
  @CreateFunction({
    name: "request_prove_owner",
    description: `This tool instructs the agent to prove ownership attestation sent from its associated did and Ethereum address.
        This function is invoked **after** the 'request_generate_keys' function to ensure the necessary cryptographic keys are available.
        It is triggered when the user explicitly asks the agent to provide a proof of its owner, such as through phrases like "Prove your owner," "Authenticate your owner," or "Provide a verifiable form of your owner."`,
    schema: ChallengeInputSchema,
    response_format: ResponseFormat.ContentAndArtifact,
  })
  async proveOwner(
    kms: KMS,
    config: Config,
    args: z.infer<typeof ChallengeInputSchema>
  ) {
    const { keyId, ethAddress, did, id } = await getKeyInfoFromKMS(
      kms,
      config.keyType,
      config.didConfig,
      config.wallet
    );

    const agentOwnershipPayload = {
      agentId: id.bigInt().toString(),
      agentDomain: config.agentDomain,
      agentAddress: ethAddress,
      ownerId: config.ownerId.toString(),
    };

    // Send attestation to blockchain
    if (
      !config.blockchainConfig ||
      !config.blockchainConfig?.rpcUrl ||
      !ethAddress
    ) {
      throw new Error(`Missing blockchain config`);
    }

    if (!config.txOwnershipAttestationFromAgent) {
      const provider = new ethers.JsonRpcProvider(
        config.blockchainConfig?.rpcUrl ?? ""
      );
      const balance = await provider.getBalance(ethAddress);

      if (balance === 0n) {
        throw new Error(
          `Insufficient balance in agent Ethereum address ${ethAddress} to send ownership attestation transaction. Please fund the address with testnet ETH.`
        );
      }

      const agentOwnershipAttestation: OwnershipAttestation = {
        agentId: agentOwnershipPayload.agentId,
        agentAddress: agentOwnershipPayload.agentAddress,
        ownerId: agentOwnershipPayload.ownerId,
      };

      const result = await sendOwnershipAttestation(
        kms,
        config.keyType,
        agentOwnershipAttestation,
        config.blockchainConfig,
        config.wallet,
        { seed: config.seed }
      );
      config.txOwnershipAttestationFromAgent = result.txHash;
    }

    const response = `Ownership attestation successfully sent with my Ethereum-based identity.

        - **DID:** ${did.string()}
        - **Id:** ${id.bigInt().toString()}
        - **Domain:** ${config.agentDomain}
        - **Ethereum Address:** ${ethAddress}
        - **OwnerId:** ${config.ownerId}
        - **Owner Ownership Attestation:** ${
          config.txOwnershipAttestationFromOwner ?? "N/A"
        }
        - **Agent Ownership Attestation:** ${
          config.txOwnershipAttestationFromAgent ?? "N/A"
        }
        
        A transaction was sent to confirm my owner with my Ethereum-based identity.
        ${
          config.blockchainConfig
            ? "Owner Ownership Attestation could be verified on-chain using this link:" +
              config.blockchainConfig.blockExplorerUrl +
              "/tx/" +
              config.txOwnershipAttestationFromOwner
            : ""
        }
      `;

    const didDoc = createDidDoc(did.string(), ethAddress);

    const payload: ProveOwnerPayload = {
      did: did.string(),
      domain: config.agentDomain,
      ethAddress,
      ownerId: config.ownerId.toString(),
      txHashOwnerAttestation: config.txOwnershipAttestationFromOwner ?? "",
      txHashAgentAttestation: config.txOwnershipAttestationFromAgent ?? "",
      response: response,
      challenge: args.challenge,
      signedResponseToken: "",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signedResponseToken, ...parsedResponsePayload } = payload;
    const signedResponseArtifactsToken = await packResponseArtifactsChallenge(
      kms,
      keyId,
      parsedResponsePayload,
      didDoc,
      {
        seed: config.seed,
      }
    );
    payload.signedResponseToken = signedResponseArtifactsToken;

    return [response, payload];
  }

  /**
   * Prove owner using ownership attestation
   *
   * @returns The response that contains ownership attestation transactions
   */
  @CreateFunction({
    name: "request_set_ownership",
    description: `This tool instructs the agent to set ownership by the owner cryptographically proving ownership with a signature from the owner address from an attestation.
        This function is invoked **after** the 'request_generate_keys' function to ensure the necessary cryptographic keys and did are available.
        It is triggered when the user explicitly asks the agent to set ownership, such as through phrases like "Set me as your owner," "I authenticate as your owner," or "I provide a verifiable form that I'm your owner."`,
    schema: OwnershipMessageSchema,
    response_format: ResponseFormat.ContentAndArtifact,
  })
  async setOwnership(
    kms: KMS,
    config: Config,
    args: z.infer<typeof OwnershipMessageSchema>
  ) {
    const { keyId, ethAddress, did, id } = await getKeyInfoFromKMS(
      kms,
      config.keyType,
      config.didConfig,
      config.wallet
    );

    if (!config.blockchainConfig || !args.txHashAttestation) {
      throw new Error(`Missing blockchain config or txHashAttestation`);
    }

    const ownershipAttestation = await getOwnershipAttestationFromOwner(
      args.txHashAttestation,
      config.blockchainConfig
    );
    const agentId = ownershipAttestation.agentId;
    const agentAddress = ownershipAttestation.agentAddress;
    const ownerId = ownershipAttestation.ownerId;

    config.txOwnershipAttestationFromOwner = args.txHashAttestation;

    if (!agentId || !agentAddress || !ownerId) {
      throw new Error(
        `Missing required fields to verify ownership attestation.`
      );
    }

    if (agentId != id.bigInt().toString()) {
      throw new Error(
        `AgentId ${agentId} does not match the derived Ethereum Identity with id ${id
          .bigInt()
          .toString()}`
      );
    }

    if (ownerId != config.ownerId.toString()) {
      throw new Error(
        `OwnerId ${ownerId} does not match the configured ownerId ${config.ownerId.toString()}`
      );
    }

    const response = `Ownership attestation successfully verified from owner and I sent my ownership attestation.

        - **DID:** ${did.string()}
        - **Id:** ${id.bigInt().toString()}
        - **Domain:** ${config.agentDomain}
        - **Ethereum Address:** ${ethAddress}
        - **OwnerId:** ${config.ownerId}
        - **Owner Ownership Attestation:** ${
          config.txOwnershipAttestationFromOwner ?? "N/A"
        }
        - **Agent Ownership Attestation:** ${
          config.txOwnershipAttestationFromAgent ?? "N/A"
        }
    `;

    const didDoc = createDidDoc(did.string(), ethAddress);

    const payload: SetOwnershipPayload = {
      did: did.string(),
      ethAddress,
      response: response,
      challenge: args.challenge,
      signedResponseToken: "",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signedResponseToken, ...parsedResponsePayload } = payload;
    const signedResponseArtifactsToken = await packResponseArtifactsChallenge(
      kms,
      keyId,
      parsedResponsePayload,
      didDoc,
      {
        seed: config.seed,
      }
    );
    payload.signedResponseToken = signedResponseArtifactsToken;

    return [response, payload];
  }

  /**
   * Prove reputation
   *
   * @returns The response that contains attestation reviews
   */
  @CreateFunction({
    name: "request_prove_reputation",
    description: `This tool instructs the agent to prove its reputation based on its Decentralized Identifier (DID) based on its attestation reviews from users.
        This function is invoked **after** the 'request_generate_keys' function to ensure the necessary cryptographic keys are available.
        It is triggered when the user explicitly asks the agent to provide a proof of its reputation or reviews, such as through phrases like "Prove your reputation", "Provide your reputation", "Show me your reviews" or "Provide review attestations for your DID."`,
    schema: ChallengeInputSchema,
    response_format: ResponseFormat.ContentAndArtifact,
  })
  async proveReputation(
    kms: KMS,
    config: Config,
    args: z.infer<typeof ChallengeInputSchema>
  ) {
    const { keyId, ethAddress, did, id } = await getKeyInfoFromKMS(
      kms,
      config.keyType,
      config.didConfig,
      config.wallet
    );

    if (!config.blockchainConfig?.reviewSchemaId) {
      throw new Error(`Missing reviewSchemaId in blockchain config`);
    }

    const info = await getReviewAttestationsInfo(
      did.string(),
      config.blockchainConfig?.reviewSchemaId,
      config.attestationServiceConfig
    );

    const response = `Reputation successfully proved from review attestations on Billions Attestation Registry.

        - **DID:** ${did.string()}
        - **Id:** ${id.bigInt().toString()}
        - **Domain:** ${config.agentDomain}
        - **Ethereum Address:** ${ethAddress}
        - **Reputation:** ⭐ ${info.averageStars.toFixed(2)} (${
      info.reviewCount
    } reviews)

    You can view the review attestations on Billions Attestation Explorer here: ${
      config.attestationServiceConfig?.explorerUrl
    }/identity/${did.string()}?schemaId=${
      config.blockchainConfig?.reviewSchemaId
    }
    `;

    const didDoc = createDidDoc(did.string(), ethAddress);

    const payload: ProveReputationPayload = {
      did: did.string(),
      ethAddress,
      response: response,
      challenge: args.challenge,
      signedResponseToken: "",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signedResponseToken, ...parsedResponsePayload } = payload;
    const signedResponseArtifactsToken = await packResponseArtifactsChallenge(
      kms,
      keyId,
      parsedResponsePayload,
      didDoc,
      {
        seed: config.seed,
      }
    );
    payload.signedResponseToken = signedResponseArtifactsToken;

    return [response, payload];
  }
}
