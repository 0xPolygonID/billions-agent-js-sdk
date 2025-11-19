import {
  AuthDidPayload,
  GenerateKeysPayLoad,
  ProveOwnerPayload,
} from "../agentkit/types";

export type AgentResponse = {
  response: string;
  artifacts?: AuthDidPayload | ProveOwnerPayload | GenerateKeysPayLoad;
};
