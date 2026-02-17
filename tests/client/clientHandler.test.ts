import { ClientHandler } from "../../src";
import { AuthDidPayload } from "../../src/agentkit/types";
import { describe, expect, it } from "vitest";

describe("Client Handler", async () => {
  const url = "http://localhost:8888/api/v1/completions";
  const rpcUrl = "https://rpc-testnet.billions.network";

  const ethPrivateKey = "<put your private key here for testing purposes>";
  const attestationRegistryAddress =
    "<put your attestation registry contract address here for testing purposes>";
  const authVerifierAddress =
    "<put your auth verifier contract address here for testing purposes>";
  const agentDidAuthSchemaId =
    "<put your agent did auth schema id here for testing purposes>";
  const agentOwnershipSchemaId =
    "<put your agent ownership schema id here for testing purposes>";
  const erc8004AttestationSchemaId =
    "<put your ERC-8004 attestation schema id here for testing purposes>";
  const erc8004RpcUrl = "https://rpc-testnet.billions.network";
  const erc8004ChainId = 6913;
  const erc8004IdentityRegistryAddress =
    "<put your ERC-8004 identity registry contract address here for testing purposes>";

  it.skip("Client should get from request agent's did and verify signature", async () => {
    const client = new ClientHandler(
      url,
      {
        rpcUrl: rpcUrl,
        ethPrivateKey: ethPrivateKey,
        attestationRegistryAddress: attestationRegistryAddress,
        authVerifierAddress: authVerifierAddress,
        agentDidAuthSchemaId: agentDidAuthSchemaId,
        agentOwnershipSchemaId: agentOwnershipSchemaId,
        erc8004AttestationSchemaId: erc8004AttestationSchemaId,
      },
      {
        rpcUrl: erc8004RpcUrl,
        chainId: erc8004ChainId,
        identityRegistryAddress: erc8004IdentityRegistryAddress,
      }
    );
    const response = await client.requestAuthDidFromAgent();
    expect(response).to.be.not.undefined;

    if (!response.response.artifacts) {
      throw new Error("No artifacts in response");
    }
    const isSignatureVerified = await client.verifyAuthDid(
      response.response.artifacts as AuthDidPayload
    );
    expect(isSignatureVerified).to.be.undefined;
  });
});
