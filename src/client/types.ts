import {
  AuthDidPayload,
  GenerateKeysPayLoad,
  ProveOwnerPayload,
} from "../agentkit/types";

export type AgentResponse = {
  response: string;
  artifacts?: AuthDidPayload | ProveOwnerPayload | GenerateKeysPayLoad;
};

export type AgentServices = {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
};

export type AgentRegistrations = {
  agentId: number;
  agentRegistry: string;
};

export type AgentURI = {
  type: string;
  name: string;
  description: string;
  image?: string;
  services: AgentServices[];
  x402Support?: boolean;
  active: boolean;
  registrations?: AgentRegistrations[];
  supportedTrust?: string[];
  tags?: string[];
};
