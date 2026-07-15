import { describe, expect, it } from 'vitest';
import { GRAPH_ZOOM_MAX, getGraphZoomRange, getNextGraphZoom } from './relationship-canvas-zoom';

describe('relationship canvas zoom', () => {
  it('uses the fitted graph zoom as the minimum zoom', () => {
    const fittedZoom = 0.206833;
    const range = getGraphZoomRange(fittedZoom);

    expect(range.min).toBe(fittedZoom);

    const next = getNextGraphZoom(fittedZoom, 0.25, range);

    expect(next).not.toBeNull();
    expect(next?.zoom).toBeGreaterThan(fittedZoom);
  });

  it('does not zoom out below the fitted graph zoom', () => {
    const range = getGraphZoomRange(1);

    expect(getNextGraphZoom(1, -0.25, range)).toBeNull();
  });

  it('clamps zoom in to the maximum zoom', () => {
    const next = getNextGraphZoom(2.9, 0.25, getGraphZoomRange(0.2));

    expect(next?.zoom).toBe(GRAPH_ZOOM_MAX);
    expect(next?.delta).toBeCloseTo(GRAPH_ZOOM_MAX / 2.9 - 1);
  });

  it('clamps an oversized fitted zoom to the maximum zoom', () => {
    expect(getGraphZoomRange(GRAPH_ZOOM_MAX + 1).min).toBe(GRAPH_ZOOM_MAX);
  });

  it('returns null when the requested zoom is already on the range boundary', () => {
    expect(getNextGraphZoom(GRAPH_ZOOM_MAX, 0.25, getGraphZoomRange(0.2))).toBeNull();
  });

  it('guards invalid current zoom values', () => {
    expect(getNextGraphZoom(Number.NaN, 0.25, getGraphZoomRange(0.2))).toBeNull();
    expect(getNextGraphZoom(0, 0.25, getGraphZoomRange(0.2))).toBeNull();
  });

  it('falls back to a valid minimum for invalid fitted zoom values', () => {
    expect(getGraphZoomRange(Number.NaN).min).toBe(1);
    expect(getGraphZoomRange(0).min).toBe(1);
  });
});
