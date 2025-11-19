import { Request, Response } from "express";
import { AgentRuntime } from "../../agentkit/agentRuntime";
import { IEthereumWallet, KMS, KmsKeyType } from "@0xpolygonid/js-sdk";
import { getAgentRuntime } from "../server";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AttestationServiceConfig, BlockchainConfig } from "../../agentkit";

export async function initAgentRuntime(args: {
  ownerId: bigint;
  ownerAddress: string;
  agentDomain: string;
  keyType: KmsKeyType;
  seed: Uint8Array;
  kms: KMS;
  llm: BaseChatModel;
  blockchainConfig?: BlockchainConfig;
  attestationServiceConfig?: AttestationServiceConfig;
  wallet: IEthereumWallet;
}) {
  const {
    keyType,
    ownerId,
    ownerAddress,
    agentDomain,
    kms,
    seed,
    llm,
    blockchainConfig,
    attestationServiceConfig,
    wallet,
  } = args;

  return await AgentRuntime.create(
    {
      kms: kms,
      keyType: keyType,
      seed: seed,
      ownerId: ownerId,
      ownerAddress: ownerAddress,
      agentDomain: agentDomain,
      blockchainConfig: blockchainConfig,
      attestationServiceConfig: attestationServiceConfig,
      wallet: wallet,
    },
    {
      generativePrompt: "You are a helpful assistant.",
      config: { configurable: { thread_id: "test" } },
      llm: llm,
    }
  );
}

const generateAnswer = async (req: Request, res: Response) => {
  const runtime = getAgentRuntime();
  const { message } = req.body;
  const { response, artifacts } = await runtime.run(message);
  const responseJson = {
    response: response,
    artifacts: artifacts,
  };
  res.status(200).json(responseJson);
};

export default {
  generateAnswer,
};
