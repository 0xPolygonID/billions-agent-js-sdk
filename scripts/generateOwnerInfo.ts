import { ClientHandler } from "../src";

async function main() {
  const client = new ClientHandler(process.env.AGENT_API_URL as string, {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL as string,
    ethPrivateKey: process.env.ETH_PRIVATE_KEY as string,
    attestationRegistryAddress: process.env
      .ATTESTATION_REGISTRY_CONTRACT_ADDRESS as string,
    authVerifierAddress: process.env.AUTH_VERIFIER_CONTRACT_ADDRESS as string,
    agentDidAuthSchemaId: process.env
      .AGENT_DID_AUTH_ATTESTATION_SCHEMA as string,
    agentOwnershipSchemaId: process.env
      .AGENT_OWNERSHIP_ATTESTATION_SCHEMA as string,
  });

  console.log(`Owner Address: ${await client.getEthereumAddress()}`);
  console.log(`Owner ID: ${await client.getUserId()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
