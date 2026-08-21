import { describe, expect, it } from 'vitest';
import { getViewportForBounds } from '@xyflow/react';
import {
  GRAPH_ZOOM_MAX,
  GRAPH_ZOOM_MIN,
  getFittedGraphZoom,
  getGraphZoomRange,
  getNextGraphZoom,
} from './relationship-canvas-zoom';

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

  it('keeps the range usable when the fit lands on the maximum zoom', () => {
    // A tiny graph on a large pane fits at the max zoom. min === max here
    // turns both zoom buttons into permanent no-ops (the reported bug), so the
    // floor falls back to 1x.
    const range = getGraphZoomRange(GRAPH_ZOOM_MAX + 1);

    expect(range.min).toBe(1);
    expect(range.max).toBe(GRAPH_ZOOM_MAX);
    expect(getNextGraphZoom(GRAPH_ZOOM_MAX, -0.25, range)?.zoom).toBeLessThan(GRAPH_ZOOM_MAX);
    expect(getNextGraphZoom(1, 0.25, range)?.zoom).toBeGreaterThan(1);
  });

  it('returns null when the requested zoom is already on the range boundary', () => {
    expect(getNextGraphZoom(GRAPH_ZOOM_MAX, 0.25, getGraphZoomRange(0.2))).toBeNull();
  });

  it('never moves opposite to the pressed direction when clamping', () => {
    // The measured graph can be slightly larger than the layout sizes the
    // range is derived from, leaving the current zoom below range.min — a
    // zoom-out press must not zoom in.
    expect(getNextGraphZoom(0.4, -0.25, { min: 0.5, max: GRAPH_ZOOM_MAX })).toBeNull();
  });

  it('guards invalid current zoom values', () => {
    expect(getNextGraphZoom(Number.NaN, 0.25, getGraphZoomRange(0.2))).toBeNull();
    expect(getNextGraphZoom(0, 0.25, getGraphZoomRange(0.2))).toBeNull();
  });

  it('falls back to a valid minimum for invalid fitted zoom values', () => {
    expect(getGraphZoomRange(Number.NaN).min).toBe(1);
    expect(getGraphZoomRange(0).min).toBe(1);
  });

  describe('getFittedGraphZoom', () => {
    const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 200 };
    const rect = { x: 0, y: 0, width: 800, height: 200 };

    it('matches the zoom the real fitView math produces', () => {
      // Asserted against the library function fitView uses internally — an
      // in-test re-derivation of the padding formula could drift together
      // with the implementation and hide a mismatch.
      const expected = getViewportForBounds(rect, 1000, 500, GRAPH_ZOOM_MIN, GRAPH_ZOOM_MAX, 0.1);
      expect(getFittedGraphZoom(bounds, 1000, 500, 0.1)).toBe(expected.zoom);
      // Sanity-pin the padding semantics of @xyflow v12 (usable pane is
      // pane / (1 + padding), floored per side): 1000 -> 910 usable px.
      expect(expected.zoom).toBeCloseTo(910 / 800, 5);
    });

    it('clamps the fitted zoom into the supported range', () => {
      expect(getFittedGraphZoom(bounds, 20000, 20000, 0)).toBe(GRAPH_ZOOM_MAX);
      expect(getFittedGraphZoom(bounds, 10, 10, 0)).toBe(GRAPH_ZOOM_MIN);
    });

    it('reports degenerate inputs as NaN so the range falls back', () => {
      expect(getFittedGraphZoom(bounds, 0, 500, 0.1)).toBeNaN();
      expect(getFittedGraphZoom({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, 1000, 500, 0.1)).toBeNaN();
      expect(getGraphZoomRange(getFittedGraphZoom(bounds, 0, 0, 0.1)).min).toBe(1);
    });
  });
});
