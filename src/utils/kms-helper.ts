import {
  InMemoryPrivateKeyStore,
  KMS,
  KmsKeyType,
  Sec256k1Provider,
} from "@0xpolygonid/js-sdk";

export const registerAgentInMemorySecp256k1KMS = (): KMS => {
  const memoryKeyStore = new InMemoryPrivateKeyStore();
  const secpProvider = new Sec256k1Provider(
    KmsKeyType.Secp256k1,
    memoryKeyStore
  );
  const kms = new KMS();
  kms.registerKeyProvider(KmsKeyType.Secp256k1, secpProvider);
  return kms;
};
