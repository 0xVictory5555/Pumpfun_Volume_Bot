export async function sleepTime(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("Chunk size must be greater than 0.");
  }
  return Array.from({ length: Math.ceil(array.length / size) }, (v, i) =>
    array.slice(i * size, i * size + size)
  );
}

export function bufferFromUInt64(value: number | string | bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

export function readBigUintLE(
  buf: Buffer,
  offset: number,
  length: number
): number {
  if (offset + length > buf.length) {
    throw new Error(`Read out of bounds: offset ${offset}, length ${length}, buffer size ${buf.length}`);
  }
  switch (length) {
    case 1:
      return buf.readUInt8(offset);
    case 2:
      return buf.readUInt16LE(offset);
    case 4:
      return buf.readUInt32LE(offset);
    case 8:
      return Number(buf.readBigUInt64LE(offset));
    default:
      throw new Error(`Unsupported data size (${length} bytes) for readBigUintLE to Number`);
  }
}