import { Config, EthereumWallet, getTools, IdentityProvider } from "../../src";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatMistralAI } from "@langchain/mistralai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { registerAgentInMemorySecp256k1KMS } from "../../src/utils/kms-helper";
import {
  generateChallenge,
  packOwnerAuthDid,
} from "../../src/agentkit/func-utils";
import { Blockchain, DID, DidMethod, NetworkId } from "@iden3/js-iden3-core";
import { hexToBytes, KmsKeyType } from "@0xpolygonid/js-sdk";
import { getRandomBytes } from "@iden3/js-crypto";
import { describe, beforeAll, it } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
const ownerId =
  24110553561033062721043359150124349927715760340195432524065782320104256001n;
const ownerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ownerPrivateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const agentDomain = "myagentdomain.dev";
const rpcUrl = "https://billions-testnet-rpc.eu-north-2.gateway.fm";

let agentId: string;
let agentAddress: string;

const streamAgentThought = async (agent: any, thought: string, config: any) => {
  const stream = await agent.stream(
    { messages: [new HumanMessage(thought)] },
    config
  );

  for await (const chunk of stream) {
    if ("agent" in chunk) {
      console.log(chunk.agent.messages[0].content);
    } else if ("tools" in chunk) {
      console.log(
        `Called function '${chunk.tools.messages[0].name}': ${chunk.tools.messages[0].content}`
      );

      if (
        (chunk.tools.messages[0].name ===
          "IdentityProvider_request_prove_did" ||
          chunk.tools.messages[0].name ===
            "IdentityProvider_request_prove_owner") &&
        chunk.tools.messages[0].artifact
      ) {
        const artifacts = chunk.tools.messages[0].artifact;
        agentId = DID.idFromDID(DID.parse(artifacts.did)).bigInt().toString();
        agentAddress = artifacts.ethAddress;
        console.log("-> AgentId:", agentId);
        console.log("-> AgentAddress:", agentAddress);
      }
    }
    console.log("-------------------");
  }
};

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

const setupAgent = async (llm: BaseChatModel) => {
  const agentKMS = registerAgentInMemorySecp256k1KMS();

  const memory = new MemorySaver();
  const agentConfig = { configurable: { thread_id: "test" } };

  const toolConfig: Config = {
    keyType: KmsKeyType.Secp256k1,
    ownerId,
    ownerAddress,
    agentDomain,
    seed: getRandomBytes(32),
    didConfig: {
      method: DidMethod.Iden3,
      blockchain: Blockchain.Billions,
      network: NetworkId.Test,
    },
    wallet: new EthereumWallet(rpcUrl, agentKMS),
  };
  const agentProvider = new IdentityProvider(agentKMS, toolConfig);

  const tools = await getTools(agentProvider);

  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: memory,
  });

  return { agent, agentConfig };
};

describe("Agent Tools with different LLMs", async () => {
  const tests = [
    {
      name: "OpenAI",
      llm: new ChatOpenAI({
        model: "gpt-5-mini",
      }),
    },
    {
      name: "Anthropic (Claude)",
      llm: new ChatAnthropic({
        model: "claude-sonnet-4-5-20250929",
      }),
    },
    {
      name: "MistralAI",
      llm: new ChatMistralAI({
        model: "mistral-large-latest",
      }),
    },
    {
      name: "Gemini",
      llm: new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
      }),
    },
  ];

  tests.forEach(({ name, llm }) => {
    describe(`Agent Tools with ${name} LLM`, async () => {
      let agent: any;
      let agentConfig: any;

      beforeAll(async () => {
        ({ agent, agentConfig } = await setupAgent(llm));
      });

      it(`Should generate key pair using tool (${name})`, async () => {
        const authToken = await getAuthToken();
        const challenge = generateChallenge();

        await streamAgentThought(
          agent,
          `Generate keys. My signed auth token: "${authToken}" and my challenge is ${challenge}`,
          agentConfig
        );
      });

      it(`Should prove DID and generate JWS (${name})`, async () => {
        const challenge = generateChallenge();
        await streamAgentThought(
          agent,
          `Prove your did, my challenge is ${challenge}`,
          agentConfig
        );
      });
      it.skip(`Should prove owner and send ownership attestation from agent (${name})`, async () => {
        const challenge = generateChallenge();
        await streamAgentThought(
          agent,
          `Prove your owner. My challenge is ${challenge}`,
          agentConfig
        );
      });
      it.skip(`Should set owner from ownership attestation from owner (${name})`, async () => {
        // Agent address should be funded with testnet ETH before running this test
        const challenge = generateChallenge();
        const txHashAttestation =
          "0x0eba1177ff5a184f7864ae5f716cc976df536c8bbaf65254108513e6ff1c3ead";

        await streamAgentThought(
          agent,
          `Set me as your owner, use my ownership attestation as proof: ${txHashAttestation}. My challenge is ${challenge}`,
          agentConfig
        );
      });
    });
  });
});
