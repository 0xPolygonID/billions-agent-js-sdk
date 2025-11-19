import {
  CompiledStateGraph,
  MemorySaver,
  MessagesAnnotation,
} from "@langchain/langgraph";
import { IdentityProvider } from "./identity-provider";
import {
  createReactAgent,
  createReactAgentAnnotation,
} from "@langchain/langgraph/prebuilt";
import { StructuredToolInterface } from "@langchain/core/tools";
import {
  AttestationServiceConfig,
  BlockchainConfig,
  Config,
  getTools,
} from "./index";
import {
  HumanMessage,
  MessageContent,
  SystemMessage,
} from "@langchain/core/messages";
import { Blockchain, DidMethod, NetworkId } from "@iden3/js-iden3-core";
import { IEthereumWallet, KMS, KmsKeyType } from "@0xpolygonid/js-sdk";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CompiledAgent = CompiledStateGraph<
  (typeof MessagesAnnotation)["State"],
  (typeof MessagesAnnotation)["Update"],
  any,
  typeof MessagesAnnotation.spec & (typeof MessagesAnnotation)["spec"],
  ReturnType<typeof createReactAgentAnnotation>["spec"] &
    (typeof MessagesAnnotation)["spec"]
>;

export class AgentRuntime {
  private readonly _agent: CompiledAgent;
  private readonly _config: any;
  private readonly _generativePrompt: string;

  constructor(agent: CompiledAgent, config: any, generativePrompt: string) {
    this._agent = agent;
    this._config = config;
    this._generativePrompt = generativePrompt;
  }

  static async create(
    identityArgs: {
      kms: KMS;
      keyType: KmsKeyType;
      ownerId: bigint;
      ownerAddress: string;
      agentDomain: string;
      wallet: IEthereumWallet;
      seed?: any;
      didConfig?: {
        method?: string;
        blockchain?: string;
        network?: string;
      };
      blockchainConfig?: BlockchainConfig;
      attestationServiceConfig?: AttestationServiceConfig;
    },
    modelArgs: {
      generativePrompt: string;
      config: any;
      llm: BaseChatModel;
      tools?: StructuredToolInterface[];
    }
  ): Promise<AgentRuntime> {
    const {
      kms,
      keyType,
      seed,
      ownerId,
      ownerAddress,
      agentDomain,
      didConfig = {},
      blockchainConfig,
      attestationServiceConfig,
      wallet,
    } = identityArgs;

    const { tools = [], config, generativePrompt, llm } = modelArgs;

    const {
      method = DidMethod.Iden3,
      blockchain = Blockchain.Billions,
      network = NetworkId.Test,
    } = didConfig;

    const memorySaver = new MemorySaver();

    const toolConfig: Config = {
      keyType: keyType,
      seed: seed,
      ownerId: ownerId,
      ownerAddress: ownerAddress,
      agentDomain: agentDomain,
      wallet: wallet,
      didConfig: { method: method, blockchain: blockchain, network: network },
      blockchainConfig: blockchainConfig,
      attestationServiceConfig: attestationServiceConfig,
    };

    const agentProvider = new IdentityProvider(kms, toolConfig);
    const identityTools = await getTools(agentProvider);
    const userTools = Array.isArray(tools) ? tools : tools ? [tools] : [];
    const allTools = [...identityTools, ...userTools];

    const agent = createReactAgent({
      llm,
      tools: allTools,
      checkpointSaver: memorySaver,
    });

    return new AgentRuntime(agent, config, generativePrompt);
  }

  async run(
    message: string
  ): Promise<{ response: MessageContent; artifacts?: any }> {
    let response: MessageContent = "Failed to run agent";
    let artifacts: any;

    const stream = await this._agent.stream(
      {
        messages: [
          new SystemMessage(this._generativePrompt),
          new HumanMessage(message),
        ],
      },
      this._config
    );

    for await (const chunk of stream) {
      if ("agent" in chunk) {
        response = chunk.agent.messages[0].content;
      } else if ("tools" in chunk) {
        const toolMessage = chunk.tools.messages[0];
        if (
          (toolMessage.name === "IdentityProvider_request_prove_did" ||
            toolMessage.name === "IdentityProvider_request_prove_owner" ||
            toolMessage.name === "IdentityProvider_request_generate_keys" ||
            toolMessage.name === "IdentityProvider_request_set_ownership") &&
          toolMessage.artifact
        ) {
          artifacts = toolMessage.artifact;
        }
      }
    }

    return { response, artifacts };
  }
}
