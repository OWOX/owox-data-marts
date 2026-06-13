export function vecToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
}

export function bufferToVec(buf: Buffer): Float32Array {
  const aligned = buf.byteOffset % 4 !== 0 ? Buffer.from(buf) : buf;
  return new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4);
}

// Valid only for unit-normalized vectors; must stay in sync with normalize: true in local-transformers.provider.ts.
export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
