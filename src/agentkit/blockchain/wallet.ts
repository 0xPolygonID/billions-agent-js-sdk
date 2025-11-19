import {
  hexToBytes,
  IEthereumWallet,
  KMS,
  KmsKeyId,
  TypedData,
} from "@0xpolygonid/js-sdk";
import { ethers, TransactionReceipt, TransactionRequest } from "ethers";

export class EthereumWallet implements IEthereumWallet {
  private _kms: KMS;
  private _rpcUrl: string;

  constructor(rpcUrl: string, kms: KMS) {
    this._rpcUrl = rpcUrl;
    this._kms = kms;
  }

  /**
   * Signs EIP712 the given data using the private key associated with the specified key identifier.
   * @param keyId - The key identifier to use for signing.
   * @param typedData - The TypedData to sign.
   * @param opts - Optional parameters.
   * @returns A Promise that resolves to the signature as a Uint8Array.
   */
  async signTypedData(
    keyId: KmsKeyId,
    typedData: TypedData,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    opts: {
      [key: string]: unknown;
    } = {}
  ): Promise<Uint8Array> {
    const keyProvider = this._kms.getKeyProvider(keyId.type);

    if (!keyProvider) {
      throw new Error("Key provider not set");
    }

    const privateKeyHex = await (
      await keyProvider.getPkStore()
    ).get({
      alias: keyId.id,
    });

    const wallet = new ethers.Wallet(privateKeyHex);

    const signature = await wallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    return hexToBytes(signature);
  }

  /**
   * Computes ETH address by key id
   *
   * @param {KmsKeyId} keyId - key id
   */
  async getEthAddress(keyId: KmsKeyId): Promise<string> {
    const keyProvider = this._kms.getKeyProvider(keyId.type);

    if (!keyProvider) {
      throw new Error("Key provider not set");
    }

    const publicKey = await keyProvider.publicKey(keyId);
    return ethers.computeAddress("0x" + publicKey);
  }

  /**
   * Sends a transaction
   * @param keyId - The key ID to use for signing the transaction
   * @param request - The transaction request
   */
  async sendTransaction(
    keyId: KmsKeyId,
    request: TransactionRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    opts?: { [key: string]: unknown }
  ): Promise<TransactionReceipt | null> {
    const keyProvider = this._kms.getKeyProvider(keyId.type);

    if (!keyProvider) {
      throw new Error("Key provider not set");
    }

    const privateKeyHex = await (
      await keyProvider.getPkStore()
    ).get({
      alias: keyId.id,
    });

    const wallet = new ethers.Wallet(
      privateKeyHex,
      new ethers.JsonRpcProvider(this._rpcUrl)
    );

    const tx = await wallet.sendTransaction(request);
    const response = await tx.wait();

    return response;
  }

  /**
   * Estimates the gas required for a transaction
   * @param keyId - The key ID to use for estimate gas for the transaction
   * @param request - The transaction request
   * @param {Object} [opts] - Optional parameters
   */
  async estimateGas(
    keyId: KmsKeyId,
    request: TransactionRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    opts?: { [key: string]: unknown }
  ): Promise<bigint> {
    const keyProvider = this._kms.getKeyProvider(keyId.type);

    if (!keyProvider) {
      throw new Error("Key provider not set");
    }

    const privateKeyHex = await (
      await keyProvider.getPkStore()
    ).get({
      alias: keyId.id,
    });

    const wallet = new ethers.Wallet(
      privateKeyHex,
      new ethers.JsonRpcProvider(this._rpcUrl)
    );

    return wallet.estimateGas(request);
  }
}
