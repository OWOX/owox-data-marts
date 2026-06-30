export function vecToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
}

export function bufferToVec(buf: Buffer): Float32Array {
  const aligned = buf.byteOffset % 4 !== 0 ? Buffer.from(buf) : buf;
  return new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4);
}

export function normalizeVec(vec: Float32Array): Float32Array | null {
  let normSquared = 0;
  for (let i = 0; i < vec.length; i++) {
    const value = vec[i] ?? 0;
    if (!Number.isFinite(value)) return null;
    normSquared += value * value;
  }

  if (normSquared <= 0) return null;

  const norm = Math.sqrt(normSquared);
  const normalized = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    normalized[i] = (vec[i] ?? 0) / norm;
  }
  return normalized;
}

// Valid only for unit-normalized vectors; must stay in sync with normalize: true in local-transformers.provider.ts.
export function cosineSim(a: Float32Array, b: Float32Array): number | null {
  if (a.length !== b.length) return null;

  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
