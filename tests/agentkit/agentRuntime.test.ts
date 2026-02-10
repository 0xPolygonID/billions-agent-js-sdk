import { AgentRuntime } from "../../src/agentkit/agentRuntime";
import { registerAgentInMemorySecp256k1KMS } from "../../src/utils/kms-helper";
import {
  generateChallenge,
  packOwnerAuthDid,
} from "../../src/agentkit/func-utils";
import { Blockchain, DidMethod, NetworkId } from "@iden3/js-iden3-core";
import { hexToBytes, KmsKeyType } from "@0xpolygonid/js-sdk";
import { getRandomBytes } from "@iden3/js-crypto";
import { describe, expect, it } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { EthereumWallet } from "../../src/agentkit";
import { verifyAgentResponse } from "../../src";

describe("AgentRuntime", async () => {
  const agentKMS = registerAgentInMemorySecp256k1KMS();
  const agentConfig = { configurable: { thread_id: "test" } };
  const ownerId =
    24110553561033062721043359150124349927715760340195432524065782320104256001n;
  const ownerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const ownerPrivateKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const agentDomain = "myagentdomain.dev";

  const rpcUrl = "https://rpc-testnet.billions.network";

  const llm = new ChatOpenAI({ model: "gpt-5-mini" });

  const getAuthToken = async () => {
    const kms = registerAgentInMemorySecp256k1KMS();
    const challenge = generateChallenge();
    await kms.createKeyFromSeed(
      KmsKeyType.Secp256k1,
      hexToBytes(ownerPrivateKey)
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
      new EthereumWallet(rpcUrl, kms)
    );
    return authToken;
  };

  it("Should generate keys and create DID using agentRuntime", async () => {
    const agentRuntime = await AgentRuntime.create(
      {
        ownerId: ownerId,
        ownerAddress: ownerAddress,
        agentDomain: agentDomain,
        kms: agentKMS,
        keyType: KmsKeyType.Secp256k1,
        seed: getRandomBytes(32),
        didConfig: {
          method: DidMethod.Iden3,
          blockchain: Blockchain.Billions,
          network: NetworkId.Test,
        },
        wallet: new EthereumWallet(rpcUrl, agentKMS),
      },
      {
        generativePrompt: "You are agent",
        config: agentConfig,
        llm: llm,
      }
    );

    const authToken = await getAuthToken();
    const challenge = generateChallenge();

    const message = await agentRuntime.run(
      `Generate keys. My signed auth token: ${authToken}. My challenge is ${challenge}`
    );
    expect(message).to.be.not.undefined;
    expect(message.artifacts).to.be.not.undefined;
    await verifyAgentResponse(message.artifacts);
  });

  it("Should prove DID with JWS using agentRuntime", async () => {
    const agentRuntime = await AgentRuntime.create(
      {
        ownerId: ownerId,
        ownerAddress: ownerAddress,
        agentDomain: agentDomain,
        kms: agentKMS,
        keyType: KmsKeyType.Secp256k1,
        seed: getRandomBytes(32),
        didConfig: {
          method: DidMethod.Iden3,
          blockchain: Blockchain.Billions,
          network: NetworkId.Test,
        },
        wallet: new EthereumWallet(rpcUrl, agentKMS),
      },
      {
        generativePrompt: "You are agent",
        config: agentConfig,
        llm: llm,
      }
    );
    const challenge = generateChallenge();
    const authToken = await getAuthToken();

    const message = await agentRuntime.run(
      `Prove me your DID. My signed auth token: "${authToken}". My challenge: ${challenge}`
    );

    expect(message).to.be.not.undefined;
    expect(message.artifacts).to.be.not.undefined;
    await verifyAgentResponse(message.artifacts);
  });

  it.skip("Should set owner from ownership attestation from owner using agentRuntime", async () => {
    // Agent address should be funded with testnet ETH before running this test
    const agentRuntime = await AgentRuntime.create(
      {
        ownerId: ownerId,
        ownerAddress: ownerAddress,
        agentDomain: agentDomain,
        kms: agentKMS,
        keyType: KmsKeyType.Secp256k1,
        seed: getRandomBytes(32),
        didConfig: {
          method: DidMethod.Iden3,
          blockchain: Blockchain.Billions,
          network: NetworkId.Test,
        },
        wallet: new EthereumWallet(rpcUrl, agentKMS),
      },
      {
        generativePrompt: "You are agent",
        config: agentConfig,
        llm: llm,
      }
    );
    const challenge = generateChallenge();

    const txHashAttestation =
      "0x0eba1177ff5a184f7864ae5f716cc976df536c8bbaf65254108513e6ff1c3ead";
    const message = await agentRuntime.run(
      `Set me as your owner, use my ownership attestation as proof: ${txHashAttestation}. My challenge: ${challenge}`
    );
    expect(message).to.be.not.undefined;
    expect(message.artifacts).to.be.not.undefined;
    await verifyAgentResponse(message.artifacts);
  });

  it.skip("Should prove owner with ownership attestation using agentRuntime", async () => {
    const agentRuntime = await AgentRuntime.create(
      {
        ownerId: ownerId,
        ownerAddress: ownerAddress,
        agentDomain: agentDomain,
        kms: agentKMS,
        keyType: KmsKeyType.Secp256k1,
        seed: getRandomBytes(32),
        didConfig: {
          method: DidMethod.Iden3,
          blockchain: Blockchain.Billions,
          network: NetworkId.Test,
        },
        wallet: new EthereumWallet(rpcUrl, agentKMS),
      },
      {
        generativePrompt: "You are agent",
        config: agentConfig,
        llm: llm,
      }
    );

    const authToken = await getAuthToken();
    const challenge = generateChallenge();

    const message = await agentRuntime.run(
      `Prove me your owner. My signed auth token: "${authToken}". My challenge: ${challenge}`
    );
    expect(message).to.be.not.undefined;
    expect(message.artifacts).to.be.not.undefined;
  });
});
