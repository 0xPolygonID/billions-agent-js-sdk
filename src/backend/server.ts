import express from "express";
import "log-timestamp";
import AgentRouter from "./routes/agent.router";
import { initAgentRuntime } from "./controllers/agent.controller";
import * as dotenv from "dotenv";
import { AgentRuntime } from "../agentkit/agentRuntime";
import { KmsKeyType } from "@0xpolygonid/js-sdk";
import { registerAgentInMemorySecp256k1KMS } from "../utils/kms-helper";
import { getRandomBytes } from "@iden3/js-crypto";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { EthereumWallet } from "../agentkit";
import cors from "cors";
/* eslint-disable no-console */

export const app = express();
const port = 8888;
const apiVersion = "v1";

dotenv.config();

let agentRuntime: AgentRuntime;
export function getAgentRuntime(): AgentRuntime {
  if (!agentRuntime) {
    throw new Error(
      "Agent session not initialized. Call initAgentSession() first."
    );
  }
  return agentRuntime;
}

async function main() {
  app.use(express.json());
  app.use(cors());

  // Register API routes
  app.use(`/api/${apiVersion}`, AgentRouter);

  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
}

main()
  .then(async () => {
    const seed = getRandomBytes(32);
    const kms = registerAgentInMemorySecp256k1KMS();
    const llm = new ChatOpenAI({ model: "gpt-5-mini" });

    agentRuntime = await initAgentRuntime({
      ownerId: BigInt(process.env.OWNER_ID as string),
      ownerAddress: process.env.OWNER_ADDRESS as string,
      agentDomain: process.env.AGENT_DOMAIN as string,
      keyType: KmsKeyType.Secp256k1,
      seed: seed,
      kms: kms,
      llm: llm as BaseChatModel,
      wallet: new EthereumWallet(process.env.BLOCKCHAIN_RPC_URL as string, kms),
      blockchainConfig: {
        rpcUrl: process.env.BLOCKCHAIN_RPC_URL as string,
        blockExplorerUrl: process.env.BLOCK_EXPLORER_URL as string,
        authVerifierAddress: process.env
          .AUTH_VERIFIER_CONTRACT_ADDRESS as string,
        attestationRegistryAddress: process.env
          .ATTESTATION_REGISTRY_CONTRACT_ADDRESS as string,
        agentDidAuthSchemaId: process.env
          .AGENT_DID_AUTH_ATTESTATION_SCHEMA as string,
        agentOwnershipSchemaId: process.env
          .AGENT_OWNERSHIP_ATTESTATION_SCHEMA as string,
        reviewSchemaId: process.env.REVIEW_ATTESTATION_SCHEMA as string,
      },
      attestationServiceConfig: {
        apiUrl: process.env.BILLIONS_ATTESTATIONS_API_URL as string,
        explorerUrl: process.env.BILLIONS_ATTESTATIONS_EXPLORER_URL as string,
        pageSize: 20,
      },
    });
  })
  .catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
