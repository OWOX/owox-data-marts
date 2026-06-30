import { vecToBuffer, bufferToVec, cosineSim } from './vector-codec';

describe('vecToBuffer / bufferToVec', () => {
  it('round-trips a Float32Array through Buffer', () => {
    const original = new Float32Array([1.0, -0.5, 0.25, 0.0]);
    const buf = vecToBuffer(original);
    const restored = bufferToVec(buf);

    expect(restored).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]!, 6);
    }
  });

  it('round-trips a single-element vector', () => {
    const original = new Float32Array([42.0]);
    const restored = bufferToVec(vecToBuffer(original));
    expect(restored[0]).toBeCloseTo(42.0, 6);
  });

  it('round-trips a 384-dim unit vector', () => {
    const dim = 384;
    const arr = new Float32Array(dim);
    for (let i = 0; i < dim; i++) arr[i] = i % 2 === 0 ? 0.1 : -0.05;
    const restored = bufferToVec(vecToBuffer(arr));
    for (let i = 0; i < dim; i++) {
      expect(restored[i]).toBeCloseTo(arr[i]!, 6);
    }
  });

  it('round-trips a misaligned buffer (byteOffset % 4 !== 0)', () => {
    const original = new Float32Array([1.0, -0.5, 0.25, 0.0]);
    const buf = vecToBuffer(original);
    const pool = Buffer.alloc(buf.length + 1);
    buf.copy(pool, 1);
    const misaligned = pool.subarray(1);

    const restored = bufferToVec(misaligned as Buffer);

    expect(restored).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]!, 6);
    }
  });
});

describe('cosineSim', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = new Float32Array([1.0, 0.0, 0.0]);
    expect(cosineSim(v, v)).toBeCloseTo(1.0, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1.0, 0.0, 0.0]);
    const b = new Float32Array([0.0, 1.0, 0.0]);
    expect(cosineSim(a, b)).toBeCloseTo(0.0, 6);
  });

  it('returns -1 for anti-parallel unit vectors', () => {
    const a = new Float32Array([1.0, 0.0]);
    const b = new Float32Array([-1.0, 0.0]);
    expect(cosineSim(a, b)).toBeCloseTo(-1.0, 6);
  });

  it('computes dot product of two known unit vectors', () => {
    const sq2 = Math.SQRT2 / 2;
    const a = new Float32Array([sq2, sq2]);
    const b = new Float32Array([sq2, -sq2]);
    expect(cosineSim(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns null for dimension mismatches', () => {
    const a = new Float32Array([1.0, 0.0, 0.0]);
    const b = new Float32Array([1.0, 0.0]);

    expect(cosineSim(a, b)).toBeNull();
  });
});
