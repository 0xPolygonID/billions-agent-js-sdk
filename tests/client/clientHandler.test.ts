import { ClientHandler } from "../../src";
import { AuthDidPayload } from "../../src/agentkit/types";
import { describe, expect, it } from "vitest";

describe("Client Handler", async () => {
  const url = "http://localhost:8888/api/v1/completions";
  const rpcUrl = "https://billions-testnet-rpc.eu-north-2.gateway.fm";

  const ethPrivateKey = "<put your private key here for testing purposes>";
  const attestationRegistryAddress =
    "<put your attestation registry contract address here for testing purposes>";
  const authVerifierAddress =
    "<put your auth verifier contract address here for testing purposes>";
  const agentDidAuthSchemaId =
    "<put your agent did auth schema id here for testing purposes>";
  const agentOwnershipSchemaId =
    "<put your agent ownership schema id here for testing purposes>";

  it.skip("Client should get from request agent's did and verify signature", async () => {
    const client = new ClientHandler(url, {
      rpcUrl: rpcUrl,
      ethPrivateKey: ethPrivateKey,
      attestationRegistryAddress: attestationRegistryAddress,
      authVerifierAddress: authVerifierAddress,
      agentDidAuthSchemaId: agentDidAuthSchemaId,
      agentOwnershipSchemaId: agentOwnershipSchemaId,
    });
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
