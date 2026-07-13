import { describe, expect, it } from 'vitest';
import { buildRoundedPath } from './rounded-path';

describe('buildRoundedPath', () => {
  it('returns an empty string for fewer than 2 points', () => {
    expect(buildRoundedPath([], 10)).toBe('');
    expect(buildRoundedPath([{ x: 0, y: 0 }], 10)).toBe('');
  });

  it('builds a straight line for 2 points', () => {
    const path = buildRoundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10
    );
    expect(path).toBe('M 0 0 L 100 0');
  });

  it('builds a single rounded corner for an L-shape', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const path = buildRoundedPath(points, 10);

    expect(path.match(/Q/g)?.length).toBe(1);
    expect(path.startsWith('M 0 0')).toBe(true);
    expect(path.endsWith('L 100 100')).toBe(true);
  });

  it('clamps the radius on short segments', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ];
    const path = buildRoundedPath(points, 10);

    expect(path).not.toMatch(/NaN/);
    expect(path).toBe('M 0 0 L 2 0 Q 4 0, 4 2 L 4 4');
  });

  it('does not produce NaN for collinear or zero-length segments', () => {
    const collinear = buildRoundedPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      10
    );
    expect(collinear).not.toMatch(/NaN/);

    const zeroLength = buildRoundedPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10
    );
    expect(zeroLength).not.toMatch(/NaN/);
  });
});
