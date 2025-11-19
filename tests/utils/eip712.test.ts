import { registerAgentInMemorySecp256k1KMS } from "../../src/utils/kms-helper";
import { bytesToHex, KmsKeyType, TypedData } from "@0xpolygonid/js-sdk";
import { getRandomBytes } from "@iden3/js-crypto";
import { ethers } from "ethers";
import { describe, it, expect } from "vitest";
import { EthereumWallet } from "../../src/agentkit";

describe("EIP712", async () => {
  const signAndVerifyEIP712 = async (
    kms: ReturnType<typeof registerAgentInMemorySecp256k1KMS>,
    keyType: KmsKeyType,
    options: { seed: Uint8Array }
  ) => {
    const lastKey = await kms.createKeyFromSeed(keyType, options.seed);
    const keyProvider = await kms.getKeyProvider(keyType);

    if (!keyProvider) {
      throw new Error("Key provider not found");
    }

    const wallet = new EthereumWallet("http://localhost:8545", kms);

    const typedData: TypedData = {
      types: {
        AgentOwnership: [
          { name: "agentId", type: "uint256" },
          { name: "agentDomain", type: "string" },
          { name: "agentAddress", type: "address" },
          { name: "ownerId", type: "uint256" },
          { name: "ownerAddress", type: "address" },
        ],
      },
      domain: {
        name: "AgentOwnershipAttestation",
        version: "1.0.0",
        chainId: 0,
        verifyingContract: ethers.ZeroAddress,
      },
      message: {
        agentId: "1",
        agentDomain: "agentDomain",
        agentAddress: ethers.ZeroAddress,
        ownerId: "1",
        ownerAddress: ethers.ZeroAddress,
      },
    };

    const signature = await wallet.signTypedData(lastKey, typedData, options);

    const recoveredAddress = ethers.verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      `0x${bytesToHex(signature)}`
    );
    return (
      recoveredAddress.toLowerCase() ===
      (await wallet.getEthAddress(lastKey)).toLowerCase()
    );
  };

  it("Should sign EIP712 using local KMS", async () => {
    const kms = registerAgentInMemorySecp256k1KMS();
    const isValid = await signAndVerifyEIP712(kms, KmsKeyType.Secp256k1, {
      seed: getRandomBytes(32),
    });
    expect(isValid).toBe(true);
  });
});
