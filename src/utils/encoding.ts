export function byteToBinary(byte: number): string {
  return byte.toString(2).padStart(8, "0");
}

export function bytesToBinary(bytes: Uint8Array): string {
  return [...bytes].map((val) => byteToBinary(val)).join("");
}

export function bytesToInteger(bytes: Uint8Array): number {
  return parseInt(bytesToBinary(bytes), 2);
}
