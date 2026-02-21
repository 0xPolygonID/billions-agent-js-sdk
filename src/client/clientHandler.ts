import { decodeAuthToken, verifyAgentResponse } from "../utils";
import {
  AttestationData,
  type AuthDidPayload,
  type ProveOwnerPayload,
  type ResponseChallengePayload,
} from "../agentkit/types";
import { type AgentResponse, type AgentURI } from "./types";
import { generateChallenge, packOwnerAuthDid } from "../agentkit/func-utils";
import attestationRegistryABI from "./abi/AttestationRegistry.json";
import authVerifierABI from "./abi/AuthVerifier.json";
import stateABI from "./abi/State.json";
import { ethers, TransactionRequest } from "ethers";
import {
  buildDIDFromEthAddress,
  byteEncoder,
  bytesToBase64,
  hexToBytes,
  KmsKeyType,
} from "@0xpolygonid/js-sdk";
import { registerAgentInMemorySecp256k1KMS } from "../utils/kms-helper";
import {
  Blockchain,
  DID,
  Id,
  DidMethod,
  NetworkId,
} from "@iden3/js-iden3-core";
import { EthereumWallet } from "../agentkit";
import identityRegistryUpgradeableABI from "./abi/IdentityRegistryUpgradeable.json";

/* eslint-disable no-console */

/**
 * Interface representing a client handler that communicates with an agent.
 */
export interface IClientHandler {
  /**
   * Sends a message to the agent and receives a message and artifacts if function tool has them.
   * @param message - The input message to send to the agent.
   * @returns {AgentResponse} A Promise that resolves to an `AgentMessage` object containing the agent's response.
   */
  sendMessage(message: string): Promise<AgentResponse>;

  /**
   * Verifies the authenticity of a DID signature using the provided payload.
   * @param payload - The authentication payload containing DID, signature, keys,
   * Ethereum address and public key.
   * @param challenge - The number provided to verify signed challenge by agent
   * @returns {void} Panics if verification failed.
   */
  verifyAuthDid(payload: AuthDidPayload): Promise<void>;

  /**
   * Verifies the authenticity of a DID signature for a response using the provided payload.
   * @param payload - The authentication payload containing DID, signature, response,
   * Ethereum address and public key.
   * @param challenge - The number provided to verify signed challenge by agent
   * @returns {void} Panics if verification failed.
   */
  verifyAuthResponse(payload: ResponseChallengePayload): Promise<void>;

  /**
   * Sends a message to the agent requesting the generation of keys.
   *
   * @returns {Promise<{ response: AgentResponse }>} message that contains agent response.
   */
  requestGenerateKeysFromAgent(): Promise<{ response: AgentResponse }>;

  /**
   * Sends a message to the agent requesting the generation/retrieval of a DID.
   *
   * @returns {Promise<{ response: AgentResponse; challenge: number }>} message that contains agent response with artifacts and user challenge.
   */
  requestAuthDidFromAgent(
    challenge?: number
  ): Promise<{ response: AgentResponse; challenge: number }>;

  /**
   * Sends a message to the agent requesting the retrieval of owner.
   *
   * @returns {Promise<{ response: AgentResponse }>} message that contains agent response with artifacts and user challenge.
   */
  requestOwnerFromAgent(): Promise<{ response: AgentResponse }>;

  /**
   * Sends a message to the agent requesting the ownership of the agent.
   *
   * @returns {Promise<{ response: AgentResponse }>} message that contains agent response with artifacts and user challenge.
   */
  requestOwnershipToAgent(
    txHashAttestation: string
  ): Promise<{ response: AgentResponse }>;

  /**
   * Sends an ownership attestation for the agent to the attestation registry.
   * @param {Object} ownershipData - The ownership data to send.
   * @returns {bigint} the attestation ID created in the attestation registry.
   */
  sendOwnershipAttestation(ownershipData: {
    agentId: string;
    agentDomain: string;
    agentAddress: string;
    ownerId: string;
    ownerAddress: string;
  }): Promise<{ attestationId: string; txHash: string }>;
  /**
   * Sends an authentication to AuthVerifier contract to enable use of the attestation registry.
   * @returns {void} the attestation ID created in the attestation registry.
   */
  authenticateToAttestationRegistry(): Promise<bigint>;

  /**
   * Retrieves an attestation from the on-chain attestation registry by its ID.
   * @param attestationId - The ID of the attestation to retrieve.
   * @returns The attestation data associated with the given ID.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAttestation(attestationId: string): Promise<any>;

  /**
   * Gets the user ID for the client.
   */
  getUserId(): Promise<bigint>;

  /**
   * Gets the user Ethereum address for the client.
   */
  getEthereumAddress(): Promise<string>;
}

/**
 * Default implementation of `IClientHandler` that communicates with an agent service.
 */
export class ClientHandler implements IClientHandler {
  protected _agentUrl: string;
  protected _blockchainConfig: {
    rpcUrl: string;
    ethPrivateKey: string;
    authVerifierAddress: string;
    attestationRegistryAddress: string;
    agentDidAuthSchemaId: string;
    agentOwnershipSchemaId: string;
    erc8004AttestationSchemaId: string;
  };
  protected _erc8004Config: {
    rpcUrl: string;
    chainId: number;
    identityRegistryAddress: string;
  };

  /**
   * Constructs a new `ClientHandler` with the given agent URL.
   * @param agentUrl - The endpoint to communicate with Agent.
   * @param blockchainConfig - The blockchain configuration including:
   * - rpcUrl - The RPC URL of the blockchain network.
   * - ethPrivateKey - The Ethereum private key used for signing transactions.
   * - authVerifierAddress - The address of the AuthVerifier contract.
   * - attestationRegistryAddress - The address of the AttestationRegistry contract.
   * - agentDidAuthSchemaId - The schema ID for DID authentication attestations.
   * - agentOwnershipSchemaId - The schema ID for ownership attestations.
   * - erc8004AttestationSchemaId - The schema ID for ERC-8004 attestations, if applicable.
   * @param erc8004Config - The ERC-8004 specific blockchain configuration including:
   * - rpcUrl - The RPC URL of the blockchain network for ERC-8004 interactions.
   * - chainId - The chain ID of the blockchain network for ERC-8004 interactions.
   * - identityRegistryAddress - The address of the IdentityRegistry contract for ERC-8004 interactions.
   */
  constructor(
    agentUrl: string,
    blockchainConfig: {
      rpcUrl: string;
      ethPrivateKey: string;
      authVerifierAddress: string;
      attestationRegistryAddress: string;
      agentDidAuthSchemaId: string;
      agentOwnershipSchemaId: string;
      erc8004AttestationSchemaId: string;
    },
    erc8004Config: {
      rpcUrl: string;
      chainId: number;
      identityRegistryAddress: string;
    }
  ) {
    this._agentUrl = agentUrl;
    this._blockchainConfig = blockchainConfig;
    this._erc8004Config = erc8004Config;
  }

  /**
   * Validates the AuthDid response from agent.
   *
   * @param agentResponse - The response object returned by the agent after DID generation.
   * @throws {Error} If any required field is missing or improperly structured.
   */
  private checkAuthDidResponse(agentResponse: AgentResponse): void {
    const errors: string[] = [];

    if (!agentResponse.response) {
      errors.push("Missing 'response' field.");
    }

    const artifacts = agentResponse.artifacts;
    if (!artifacts) {
      throw new Error("Missing 'artifacts' field.");
    }

    const {
      did,
      signedDidAuthToken,
      signedResponseToken,
      response,
      keyType,
      ethAddress,
    } = artifacts as AuthDidPayload;

    if (!did) errors.push("Missing 'did' in 'artifacts'.");
    if (!signedDidAuthToken)
      errors.push("Missing 'signedDidAuthToken' in 'artifacts'.");
    if (!keyType) errors.push("Missing 'keyType' in 'artifacts'.");
    if (!ethAddress) errors.push("Missing 'ethAddress' in 'artifacts'.");
    if (!response) errors.push("Missing 'response' in 'artifacts'.");
    if (!signedResponseToken)
      errors.push("Missing 'signedResponseToken' in 'artifacts'.");

    if (errors.length > 0) {
      throw new Error(`Invalid agent response:\n- ${errors.join("\n- ")}`);
    }
  }

  /**
   * Validates the owner response from agent.
   *
   * @param agentResponse - The response object returned by the agent after owner proving.
   * @throws {Error} If any required field is missing or improperly structured.
   */
  private checkOwnerResponse(agentResponse: AgentResponse): void {
    const errors: string[] = [];

    if (!agentResponse.response) {
      errors.push("Missing 'response' field.");
    }

    const artifacts = agentResponse.artifacts;
    if (!artifacts) {
      throw new Error("Missing 'artifacts' field.");
    }

    const {
      did,
      txHashAgentAttestation,
      txHashOwnerAttestation,
      ethAddress,
      response,
      signedResponseToken,
    } = artifacts as ProveOwnerPayload;

    if (!did) errors.push("Missing 'did' in 'artifacts'.");
    if (!txHashOwnerAttestation)
      errors.push("Missing 'txHashOwnerAttestation' in 'artifacts'.");
    if (!txHashAgentAttestation)
      errors.push("Missing 'txHashAgentAttestation' in 'artifacts'.");
    if (!ethAddress) errors.push("Missing 'ethAddress' in 'artifacts'.");
    if (!response) errors.push("Missing 'response' in 'artifacts'.");
    if (!signedResponseToken)
      errors.push("Missing 'signedResponseToken' in 'artifacts'.");
    if (errors.length > 0) {
      throw new Error(`Invalid agent response:\n- ${errors.join("\n- ")}`);
    }
  }

  async requestGenerateKeysFromAgent(): Promise<{ response: AgentResponse }> {
    const kms = registerAgentInMemorySecp256k1KMS();
    const challenge = generateChallenge();
    await kms.createKeyFromSeed(
      KmsKeyType.Secp256k1,
      hexToBytes(this._blockchainConfig.ethPrivateKey)
    );

    const authToken = await packOwnerAuthDid(
      kms,
      KmsKeyType.Secp256k1,
      {
        method: DidMethod.Iden3,
        blockchain: Blockchain.Billions,
        network: NetworkId.Test,
      },
      challenge,
      new EthereumWallet(this._blockchainConfig.rpcUrl, kms)
    );

    const message = `Generate your keys and DID, my signed auth token: ${authToken}. My challenge is ${challenge}`;
    const response: AgentResponse = await this.sendMessage(message);
    return { response };
  }

  async requestAuthDidFromAgent(
    challenge?: number
  ): Promise<{ response: AgentResponse; challenge: number }> {
    const actualChallenge = challenge ?? generateChallenge();
    const message = `Prove and provide me your DID, my challenge: ${actualChallenge}`;
    const response: AgentResponse = await this.sendMessage(message);
    this.checkAuthDidResponse(response);
    return { response, challenge: actualChallenge };
  }

  async requestOwnerFromAgent(): Promise<{ response: AgentResponse }> {
    const challenge = generateChallenge();
    const message = `Prove and provide me your owner, my challenge: ${challenge}`;
    const response: AgentResponse = await this.sendMessage(message);
    this.checkOwnerResponse(response);
    return { response };
  }

  /**
   * Sends a message to the agent requesting the ownership of the agent.
   *
   * @returns {Promise<{ response: AgentResponse }>} message that contains agent response with artifacts and user challenge.
   */
  async requestOwnershipToAgent(
    txHashAttestation: string
  ): Promise<{ response: AgentResponse }> {
    const challenge = generateChallenge();
    const message = `Set me as your owner, use my ownership attestation as proof: ${txHashAttestation}. My challenge is ${challenge}`;
    const response: AgentResponse = await this.sendMessage(message);
    return { response };
  }

  /**
   * Verifies the signature in the DID authentication payload.
   * Uses Secp256k1 or EVM-style recovery based on the key type.
   * @param payload - The payload containing signature and challenge information.
   * @param challenge - The challenge to be verified from body of unpacked JWS
   * @throws Error if the JWS is not valid or challenge doesn't match.
   */
  async verifyAuthDid(payload: AuthDidPayload): Promise<void> {
    const decodedPayload = await decodeAuthToken(payload.signedDidAuthToken, {
      did: payload.did,
      address: payload.ethAddress,
    });
    if (!decodedPayload?.from) {
      throw new Error("Missing required field: 'from' in decoded payload");
    }

    if (!decodedPayload?.challenge) {
      throw new Error("Missing required field: 'challenge' in decoded payload");
    }

    if (decodedPayload.challenge.toString() !== payload.challenge.toString()) {
      throw new Error("Challenge doesn't match");
    }
  }

  /**
   * Verifies the signature in the DID authentication payload.
   * Uses Secp256k1 or EVM-style recovery based on the key type.
   * @param payload - The payload containing signature, response and challenge information.
   * @param challenge - The challenge to be verified from body of unpacked JWS
   * @throws Error if the JWS is not valid or challenge doesn't match.
   */
  async verifyAuthResponse(payload: ResponseChallengePayload): Promise<void> {
    return verifyAgentResponse(payload);
  }

  /**
   * Sends a message to the agent via POST request and returns the structured response.
   * @param message - The message string to send.
   * @returns A Promise resolving to the `AgentMessage` returned by the agent.
   * @throws Error the request fails or response format is invalid.
   */
  async sendMessage(message: string): Promise<AgentResponse> {
    const response = await fetch(this._agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data as AgentResponse;
  }

  private async getBlockchainArtifacts(): Promise<{
    wallet: ethers.Wallet;
    attestationRegistry: ethers.Contract;
    authVerifier: ethers.Contract;
    state: ethers.Contract;
    didType: Uint8Array;
    attesterDid: string;
    attesterId: bigint;
  }> {
    const wallet = new ethers.Wallet(
      this._blockchainConfig.ethPrivateKey,
      new ethers.JsonRpcProvider(this._blockchainConfig.rpcUrl)
    );
    const attestationRegistry = new ethers.Contract(
      this._blockchainConfig.attestationRegistryAddress,
      attestationRegistryABI,
      wallet
    );
    const authVerifier = new ethers.Contract(
      this._blockchainConfig.authVerifierAddress,
      authVerifierABI,
      wallet
    );

    const stateAddress = await authVerifier.getStateAddress();
    const state = new ethers.Contract(stateAddress, stateABI, wallet);

    const didType = await state.getDefaultIdType();

    const attesterDid = buildDIDFromEthAddress(
      hexToBytes(didType),
      wallet.address
    );
    const attesterId = DID.idFromDID(attesterDid).bigInt();

    return {
      wallet,
      attestationRegistry,
      authVerifier,
      state,
      didType,
      attesterDid: attesterDid.string(),
      attesterId,
    };
  }

  private async sendAttestation(
    attestationData: AttestationData
  ): Promise<{ attestationId: string; txHash: string }> {
    const provider = new ethers.JsonRpcProvider(this._blockchainConfig.rpcUrl);
    const feeData = await provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

    const attestationRegistry = new ethers.Contract(
      this._blockchainConfig.attestationRegistryAddress,
      attestationRegistryABI
    );

    const payload =
      await attestationRegistry.recordAttestation.populateTransaction(
        attestationData
      );
    const maxGasLimit = 10000000n;

    const request: TransactionRequest = {
      to: this._blockchainConfig.attestationRegistryAddress,
      data: payload.data,
      maxFeePerGas: maxFeePerGas as bigint,
      maxPriorityFeePerGas: maxPriorityFeePerGas as bigint,
      gasLimit: maxGasLimit,
    };

    const wallet = new ethers.Wallet(
      this._blockchainConfig.ethPrivateKey,
      new ethers.JsonRpcProvider(this._blockchainConfig.rpcUrl)
    );

    const tx = await wallet.sendTransaction(request);
    const result = await tx.wait();

    const attestationId = result?.logs[0].topics[1] as string;
    return { attestationId, txHash: tx.hash };
  }

  /**
   * Sends an ownership attestation from the agent response to the attestation registry.
   * @param {AgentResponse} AgentResponse - The agent response to prove owner request.
   * @returns {Promise<{ attestationId: string; txHash: string }>} An object containing the created attestation ID and transaction hash.
   */
  async sendOwnershipAttestation(ownershipData: {
    agentId: string;
    agentDomain: string;
    agentAddress: string;
    ownerId: string;
    ownerAddress: string;
  }): Promise<{ attestationId: string; txHash: string }> {
    const { wallet, attesterId } = await this.getBlockchainArtifacts();

    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes"],
      ["0x"]
    );

    const agentDid = DID.parseFromId(
      Id.fromBigInt(BigInt(ownershipData.agentId))
    ).string();

    const attesterDid = DID.parseFromId(
      Id.fromBigInt(BigInt(ownershipData.ownerId))
    ).string();

    const attestationData: AttestationData = {
      schemaId: this._blockchainConfig.agentOwnershipSchemaId,
      attester: {
        did: attesterDid,
        iden3Id: attesterId,
        ethereumAddress: wallet.address,
      },
      recipient: {
        did: agentDid,
        iden3Id: BigInt(ownershipData.agentId),
        ethereumAddress: ownershipData.agentAddress,
      },
      expirationTime: 0, // No expiration
      revocable: true,
      refId: ethers.ZeroHash,
      data: encodedData,
    };

    return this.sendAttestation(attestationData);
  }

  /**
   * Sends an ERC8004 Agent Registry attestation to the attestation registry.
   * @param {string} ERC8004AgentId - The agent ID from ERC8004 Agent Registry.
   * @param {string} agentId - The agent ID from the agent's perspective (DID ID).
   * @param {string} agentAddress - The Ethereum address of the agent.
   * @param {string} ownerId - The owner ID from the agent's perspective (DID ID).
   * @returns {Promise<{ attestationId: string; txHash: string }>} An object containing the created attestation ID and transaction hash.
   */
  async sendERC8004Attestation(
    ERC8004AgentId: string,
    agentId: string,
    agentAddress: string,
    ownerId: string
  ): Promise<{ attestationId: string; txHash: string }> {
    const { wallet, attesterId } = await this.getBlockchainArtifacts();

    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "uint256"],
      [
        this._erc8004Config.chainId,
        this._erc8004Config.identityRegistryAddress,
        BigInt(ERC8004AgentId),
      ]
    );

    const agentDid = DID.parseFromId(Id.fromBigInt(BigInt(agentId))).string();

    const attesterDid = DID.parseFromId(
      Id.fromBigInt(BigInt(ownerId))
    ).string();

    const attestationData: AttestationData = {
      schemaId: this._blockchainConfig.erc8004AttestationSchemaId,
      attester: {
        did: attesterDid,
        iden3Id: attesterId,
        ethereumAddress: wallet.address,
      },
      recipient: {
        did: agentDid,
        iden3Id: BigInt(agentId),
        ethereumAddress: agentAddress,
      },
      expirationTime: 0, // No expiration
      revocable: true,
      refId: ethers.ZeroHash,
      data: encodedData,
    };

    return this.sendAttestation(attestationData);
  }

  /**
   * Sends an authentication to AuthVerifier contract to enable use of the attestation registry.
   * @returns {void} the attestation ID created in the attestation registry.
   */
  async authenticateToAttestationRegistry(): Promise<bigint> {
    const { wallet, attesterId, authVerifier } =
      await this.getBlockchainArtifacts();

    // Check if the user is already authenticated
    let currentUserId = await authVerifier.getIdByAddress(wallet.address);

    if (currentUserId === 0n || currentUserId !== attesterId) {
      console.log(
        `🔑 User not authenticated yet, submitting authentication...`
      );

      try {
        // First, we need to authenticate with the AuthVerifier
        // Create an auth response with ethIdentity method, which AuthVerifier will recognize
        const authResponse = {
          authMethod: "ethIdentity",
          proof: ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256"],
            [attesterId]
          ),
        };

        // Check if authVerifier is properly configured
        try {
          // First we need to check if the ethIdentity method is registered
          console.log(`Checking if ethIdentity auth method exists...`);

          try {
            // Try to get the auth method info (this will throw if it doesn't exist)
            const authMethodExists = await authVerifier.authMethodExists(
              "ethIdentity"
            );
            if (!authMethodExists) {
              console.log(
                `⚠️ ethIdentity auth method does not exist in AuthVerifier!`
              );
              throw new Error("ethIdentity auth method not found");
            }
            console.log(`✅ ethIdentity auth method exists`);

            // Try to submit the authentication response
            console.log(`Submitting authentication response...`);
            const authTx = await authVerifier.submitResponse(
              authResponse,
              [], // Empty responses array
              "0x" // Empty cross chain proofs
            );
            console.log(
              `⏳ Authentication transaction submitted: ${authTx.hash}`
            );
            await authTx.wait();
            console.log(
              `✅ User authenticated successfully with ID: ${attesterId}`
            );

            // Verify authentication worked
            currentUserId = await authVerifier.getIdByAddress(wallet.address);
            console.log(
              `Verified user ID after authentication: ${currentUserId}`
            );

            if (currentUserId === 0n) {
              throw new Error(
                "Authentication failed - user ID is still 0 after authentication"
              );
            }
          } catch (methodError) {
            console.error(`ethIdentity method error: ${methodError}`);
            throw new Error(
              `Authentication failed: The ethIdentity auth method is either not registered or not properly configured in the AuthVerifier contract. Make sure to deploy and register the ethIdentity validator first.`
            );
          }
        } catch (authError) {
          console.error(`Authentication error: ${authError}`);
          throw new Error(`Could not authenticate: ${authError}`);
        }
      } catch (error) {
        console.error(`❌ Authentication process failed: ${error}`);
        throw new Error(
          `User authentication failed. Cannot proceed with attestation creation. Error: ${error}`
        );
      }
    } else {
      console.log(`✅ User already authenticated with ID: ${currentUserId}`);
      // Use the existing user ID from the AuthVerifier
      if (currentUserId.toString() !== attesterId.toString()) {
        console.log(
          `⚠️ Warning: Current user ID ${currentUserId} differs from generated ID ${attesterId}`
        );
        console.log(
          `Using the authenticated ID from AuthVerifier: ${currentUserId}`
        );
      }
    }

    return currentUserId;
  }

  /**
   * Retrieves an attestation from the on-chain attestation registry by its ID.
   * @param attestationId - The ID of the attestation to retrieve.
   * @returns The attestation data associated with the given ID.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAttestation(attestationId: string): Promise<any> {
    const { attestationRegistry } = await this.getBlockchainArtifacts();
    return attestationRegistry.getAttestation(attestationId);
  }

  /**
   * Gets the user ID for the.
   */
  async getUserId(): Promise<bigint> {
    const { attesterId } = await this.getBlockchainArtifacts();
    return attesterId;
  }

  /**
   * Gets the user Ethereum address.
   */
  async getEthereumAddress(): Promise<string> {
    const { wallet } = await this.getBlockchainArtifacts();
    return wallet.address;
  }

  /**
   * Registers the agent on-chain using ERC-8004 IdentityRegistryUpgradeable contract by sending a transaction.
   * @return {bigint} the agent ID created in the IdentityRegistryUpgradeable contract.
   */
  async registerAgentERC8004(agentURI: AgentURI): Promise<bigint> {
    const wallet = new ethers.Wallet(
      this._blockchainConfig.ethPrivateKey,
      new ethers.JsonRpcProvider(this._erc8004Config.rpcUrl)
    );

    const identityRegistry = new ethers.Contract(
      this._erc8004Config.identityRegistryAddress,
      identityRegistryUpgradeableABI,
      wallet
    );

    const base64AgentURI = bytesToBase64(
      byteEncoder.encode(JSON.stringify(agentURI)),
      { pad: true }
    );
    const tx = await identityRegistry["register(string)"](
      `data:application/json;base64,${base64AgentURI}`
    );
    const receipt = await tx.wait();
    const eventInterface = identityRegistry.interface;
    const registeredEvent = receipt.logs.find((log: any) => {
      try {
        const parsedLog = identityRegistry.interface.parseLog(log);
        return parsedLog?.name === "Registered";
      } catch {
        return false;
      }
    });

    let agentId;
    if (registeredEvent) {
      const parsedLog = eventInterface.parseLog(registeredEvent);
      if (parsedLog) {
        agentId = parsedLog.args.agentId;
      }
    }
    if (!agentId) {
      throw new Error("Failed to retrieve agent ID from registration event");
    }
    return agentId;
  }

  /**
   * Sets the agent URI on-chain using ERC-8004 IdentityRegistryUpgradeable contract by sending a transaction with the agent URI encoded in the data field.
   * @param agentId - The ID of the agent to set the URI for.
   * @param agentURI - The agent URI object containing metadata and service information about the agent.
   */
  async setAgentURI(agentId: bigint, agentURI: AgentURI): Promise<void> {
    const wallet = new ethers.Wallet(
      this._blockchainConfig.ethPrivateKey,
      new ethers.JsonRpcProvider(this._erc8004Config.rpcUrl)
    );

    const identityRegistry = new ethers.Contract(
      this._erc8004Config.identityRegistryAddress,
      identityRegistryUpgradeableABI,
      wallet
    );

    const base64AgentURI = bytesToBase64(
      byteEncoder.encode(JSON.stringify(agentURI)),
      { pad: true }
    );

    const tx = await identityRegistry.setAgentURI(
      agentId,
      `data:application/json;base64,${base64AgentURI}`
    );
    await tx.wait();
  }
}
