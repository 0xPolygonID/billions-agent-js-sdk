# Billions Agent JS SDK

The **Billions Agent JS SDK** provides a set of function tools designed for use with LLM models that support function calling. It enables these models to generate and manage decentralized identities (DIDs). The SDK includes:

- Key pair generation using a local storage provider
- Generation of agent identity (DID)
- A proof-of-identity function that allows the LLM to verify ownership of its identity

These tools are modular and can be integrated with any agent framework, making it easier to add self-sovereign identity capabilities to autonomous agents.

## **Motivation**

As LLM-based agents become more autonomous and begin interacting with on-chain systems, identity becomes a core requirement. Agents must be able to authenticate actions, sign data, and prove ownership of a persistent identity across sessions and platforms.

Traditional identity frameworks are not well-suited for agents. They often require human input, rely on centralized services, or lack support for cryptographic proofs. The **Billions Agent JS SDK** addresses this gap by enabling agents to generate and manage decentralized identities (DIDs) independently, using secure and verifiable methods.

## Architecture

The **Billions Agent JS SDK**’s identity functionality is implemented as a modular `IdentityProvider` class extending from a generic `ActionProvider`. This class exposes a set of core cryptographic and identity-related operations designed to be invoked as LLM function tools, enabling autonomous agents to manage decentralized identities.

### Core Components and Flow:

- **Kms (Key Management System) (JS-SDK):**

  This module abstracts cryptographic key storage and operations. It supports local keys in this project and it could be integrated with external key provider, enabling flexible key management across different backends.

- **IdentityProvider:**

  The main class providing identity-related functions, such as generating key pairs, creating or retrieving DIDs, and proving ownership of a DID via cryptographic challenge-response.

- **Function Decorators (`@CreateFunction`):**

  Each identity operation is wrapped as an LLM-callable function tool with a defined schema and response format. This structure facilitates easy integration with LLMs that support function calls, allowing agents to request or prove their identity dynamically.

### Key Functions:

1. **`generateKeys`:**

   Generates or retrieves an existing cryptographic keypair (Ethereum key pair) using the configured `Kms`. Supports both local key generation and Lit Protocol signing keys. Returns the Ethereum address and public key tied to the generated keys.

2. **`proveDid`:**

   Implements a cryptographic proof of DID ownership by signing a challenge (nonce) with the agent’s private key. The proof is packed into a JSON Web Signature (JWS), allowing verifiable authentication of the agent’s identity. This function supports scenarios where a verifier challenges the agent to prove control over the DID.

3. **`setOwnership`:**

Receives an ownership attestation from the owner to the agent for the agent to verify and to set ownership to the owner.

4. **`proveOwner`:**

Agent sents or returns transaction hash of an ownership attestation from the agent to the owner proving the ownership. It also returns previous transaction hash of the ownership attestation from the owner.

## **Goals**

- Enable LLM agents to generate and manage identities and attestations
- Support verifiable identity ownership

## Configuration

1. Install dependencies:
   ```
   npm install
   ```

2. Create a .env file by copying from .env.example:
   ```
   cp .env.example .env
   ```

3. Fill in the required environment variables in .env:

   - `OPENAI_API_KEY` – required to run the local model.
   - `AGENT_API_URL` - agent endpoint required to run `attestAgent.ts` sample script
   - `AGENT_DOMAIN` - agent domain
   - `AGENT_FUND_AMOUNT_ETH` - Amount for agent funding to be able to send attestations to Attestation Registry
   - `BLOCKCHAIN_RPC_URL` - blockchain RPC url for interacting with Attestation Registry
   - `BLOCK_EXPLORER_URL` - blockchain explorer url
   - `ATTESTATION_REGISTRY_CONTRACT_ADDRESS` - Attestation Registry contract address
   - `AUTH_VERIFIER_CONTRACT_ADDRESS` - AuthVerifier contract address
   - `ETH_PRIVATE_KEY` - private key to send transactions for attestations to Attestation Registry and for LIT protocol configuration
   - `AGENT_OWNERSHIP_ATTESTATION_SCHEMA` - agent ownership attestation schema to send on-chain attestations
   - `AGENT_DID_AUTH_ATTESTATION_SCHEMA` - agent DID auth attestation schema to send on-chain attestations
   - `OWNER_ID` - Owner id of the agent
   - `OWNER_ADDRESS` - Owner address of the agent

   You can generate the `OWNER_ID` and `OWNER_ADDRESS` from the `ETH_PRIVATE_KEY` executing this script:
   ```
   npm run generate:owner:info
   ```


4. To start the server with the model locally:
   ```
   npm run start
   ```

### Run with Docker

1. Build the Docker image:
   `docker build -t identity-model-backend .`
2. Run the container:
   `docker run -d -p 8888:8888 --env-file .env identity-model-backend`

This will expose the service on http://localhost:8888.

### Interaction with model

To test the model using a script and `.env`, run: `node --env-file=.env --import tsx ./scripts/attestAgent.ts`
Alternatively, you can use tools like Postman or cURL.

API Endpoint:

URL: http://localhost:8888/api/v1/completions

Method: `POST`

Content-Type: `application/json`

Request Body:

```
{"message": "Generate your DID. My challenge is 123"}
```

(We send challenges to verify that the message comes from agent DID. Agent will sign response with JWS token with its DID.)

## License

billions-agent-js-sdk is part of the 0xPolygonID project copyright 2026 ZKID Labs AG
