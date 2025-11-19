import { z } from "zod";

const EthAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("An Ethereum address (42 characters, starting with '0x').");
const PublicKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/)
  .describe(
    "An uncompressed Ethereum public key (64 hexadecimal characters, starting with '0x')."
  );
const SignatureSchema = z
  .string()
  .describe("A hexadecimal-encoded digital signature string.");
const TimestampSchema = z
  .number()
  .int()
  .describe("A Unix timestamp as an integer.");

export const ChallengeInputSchema = z.object({
  challenge: TimestampSchema,
});

const DidSchema = z
  .string()
  .regex(/^did:[a-z0-9]+(?::[a-zA-Z0-9.\-_]+)+$/, {
    message: "Invalid DID format",
  })
  .describe(
    "A Decentralized Identifier (DID) like 'did:example:123456789abcdefghi'."
  );

const AuthTokenSchema = z.string().describe("A JWS auth token string.");

export const AuthTokenInputSchema = z.object({
  authToken: AuthTokenSchema,
  challenge: TimestampSchema,
});

const VerificationLinkSchema = z
  .string()
  .url()
  .describe("A verification link URL.");

export const NoArgumentsSchema = z.object({});
export const AddressWithPkSchema = z
  .object({
    ethAddress: EthAddressSchema,
    publicKey: PublicKeySchema,
  })
  .describe(
    "An object containing an Ethereum address and its corresponding public key."
  );

export const AuthDIDSchema = z
  .object({
    did: DidSchema,
    agentVerificationLink: VerificationLinkSchema,
    signature: SignatureSchema,
    challenge: TimestampSchema,
    agentIdentity: AddressWithPkSchema,
  })
  .describe(
    "An object containing a DID, verification link, signature, challenge, Ethereum address with public key."
  );

export const OwnershipMessageSchema = z
  .object({
    txHashAttestation: z
      .string()
      .regex(/^0x[a-fA-F0-9]+$/)
      .describe("The transaction hash of the attestation.")
      .nullable()
      .optional(),
    challenge: TimestampSchema,
  })
  .describe(
    "An object containing the info and transaction hash of the attestation."
  );
