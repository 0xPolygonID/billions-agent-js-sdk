import { AuthDIDSchema } from "../agentkit";
import { createDidDoc } from "../agentkit/func-utils";
import { DIDResolutionResult } from "did-resolver";
import {
  byteEncoder,
  bytesToBase64url,
  bytesToHex,
  JWSPacker,
  KMS,
} from "@0xpolygonid/js-sdk";
import { AgentBasicMessage, ResponseChallengePayload } from "../agentkit/types";

export function parseVerificationLinkWithDid(input: unknown) {
  const result = AuthDIDSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Invalid Ethereum address or DID.");
  }
  return result.data;
}

export async function decodeAuthToken(
  token: string,
  payload: { did: string; address: string }
): Promise<AgentBasicMessage> {
  const didDoc = createDidDoc(payload.did, payload.address);
  const resolveDIDDocument: {
    resolve: (did: string) => Promise<DIDResolutionResult>;
  } = {
    resolve: () =>
      Promise.resolve({ didDocument: didDoc } as DIDResolutionResult),
  };
  const jwsPacker = new JWSPacker(new KMS(), resolveDIDDocument);
  const encodedToken = byteEncoder.encode(token);
  return jwsPacker.unpack(encodedToken) as Promise<AgentBasicMessage>;
}

export async function verifyAgentResponse(
  payload: ResponseChallengePayload
): Promise<void> {
  const jwsParts = payload.signedResponseToken.split(".");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signedResponseToken, ...parsedResponsePayload } = payload;

  const fullJws =
    jwsParts[0] +
    "." +
    bytesToBase64url(
      byteEncoder.encode(
        JSON.stringify({
          from: payload.did,
          artifacts: `0x${bytesToHex(
            byteEncoder.encode(JSON.stringify(parsedResponsePayload))
          )}`,
          challenge: payload.challenge.toString(),
        })
      )
    ) +
    "." +
    jwsParts[2];

  const decodedPayload = await decodeAuthToken(fullJws, {
    did: payload.did,
    address: payload.ethAddress,
  });
  if (!decodedPayload?.from) {
    throw new Error("Missing required field: 'from' in decoded payload");
  }

  if (!decodedPayload?.challenge) {
    throw new Error("Missing required field: 'challenge' in decoded payload");
  }

  if (decodedPayload.challenge.toString() !== payload.challenge.toString()) {
    throw new Error("Challenge doesn't match");
  }

  if (
    decodedPayload.artifacts !==
    `0x${bytesToHex(byteEncoder.encode(JSON.stringify(parsedResponsePayload)))}`
  ) {
    throw new Error("Artifacts doesn't match");
  }
}
