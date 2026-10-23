import { describe, expect, it } from 'vitest';
import { getViewportForBounds } from '@xyflow/react';
import {
  GRAPH_READABLE_ZOOM,
  GRAPH_ROOT_FOCUS_MARGIN,
  GRAPH_ZOOM_MAX,
  GRAPH_ZOOM_MIN,
  getFittedGraphViewport,
  getGraphZoomRange,
  getInitialGraphViewport,
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

  describe('getFittedGraphViewport', () => {
    const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 200 };
    const rect = { x: 0, y: 0, width: 800, height: 200 };

    it('matches the viewport the real fitView math produces', () => {
      // The automatic first fit applies this viewport directly (fitView would
      // race node measurement), so it must be byte-equal to the library math —
      // an in-test re-derivation of the padding formula could drift together
      // with the implementation and hide a mismatch.
      const expected = getViewportForBounds(rect, 1000, 500, GRAPH_ZOOM_MIN, GRAPH_ZOOM_MAX, 0.1);
      expect(getFittedGraphViewport(bounds, 1000, 500, 0.1)).toEqual(expected);
      // Sanity-pin the padding semantics of @xyflow v12 (usable pane is
      // pane / (1 + padding), floored per side): 1000 -> 910 usable px.
      expect(expected.zoom).toBeCloseTo(910 / 800, 5);
    });

    it('clamps the fitted zoom into the supported range', () => {
      expect(getFittedGraphViewport(bounds, 20000, 20000, 0)?.zoom).toBe(GRAPH_ZOOM_MAX);
      expect(getFittedGraphViewport(bounds, 10, 10, 0)?.zoom).toBe(GRAPH_ZOOM_MIN);
    });

    it('returns null for degenerate geometry so the zoom range falls back', () => {
      expect(getFittedGraphViewport(bounds, 0, 500, 0.1)).toBeNull();
      expect(getFittedGraphViewport({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, 1000, 500, 0.1)).toBe(
        null
      );
      expect(
        getGraphZoomRange(getFittedGraphViewport(bounds, 0, 0, 0.1)?.zoom ?? Number.NaN).min
      ).toBe(1);
    });
  });

  describe('getInitialGraphViewport', () => {
    const pane = { paneWidth: 1000, paneHeight: 480 };

    it('keeps the full fit when the whole graph is readable', () => {
      const fitted = { x: 12, y: 34, zoom: GRAPH_READABLE_ZOOM };

      expect(
        getInitialGraphViewport({
          fitted,
          bounds: { minX: 0, minY: 0, maxX: 800, maxY: 300 },
          root: { x: 0, y: 126, width: 240, height: 48 },
          direction: 'horizontal',
          ...pane,
        })
      ).toBe(fitted);
    });

    it('keeps the full fit when the root card is unknown', () => {
      const fitted = { x: 0, y: 0, zoom: 0.1 };

      expect(
        getInitialGraphViewport({
          fitted,
          bounds: { minX: 0, minY: 0, maxX: 3000, maxY: 4000 },
          root: null,
          direction: 'horizontal',
          ...pane,
        })
      ).toBe(fitted);
    });

    it('opens a large horizontal graph on the root card pinned to the left edge', () => {
      const root = { x: 0, y: 1976, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds: { minX: 0, minY: 0, maxX: 3000, maxY: 4000 },
        root,
        direction: 'horizontal',
        ...pane,
      });

      expect(viewport.zoom).toBe(GRAPH_READABLE_ZOOM);
      // Screen position of a flow point = viewport offset + point * zoom.
      expect(viewport.x + root.x * viewport.zoom).toBeCloseTo(GRAPH_ROOT_FOCUS_MARGIN);
      expect(viewport.y + (root.y + root.height / 2) * viewport.zoom).toBeCloseTo(
        pane.paneHeight / 2
      );
    });

    it('opens a large vertical graph on the root card pinned to the top edge', () => {
      const root = { x: 1880, y: 0, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds: { minX: 0, minY: 0, maxX: 4000, maxY: 3000 },
        root,
        direction: 'vertical',
        ...pane,
      });

      expect(viewport.zoom).toBe(GRAPH_READABLE_ZOOM);
      expect(viewport.y + root.y * viewport.zoom).toBeCloseTo(GRAPH_ROOT_FOCUS_MARGIN);
      expect(viewport.x + (root.x + root.width / 2) * viewport.zoom).toBeCloseTo(
        pane.paneWidth / 2
      );
    });

    it('keeps a shallow graph centered along the layout direction', () => {
      // A wide fan-out: too tall to read when fitted, but its two ranks fit
      // the pane width at the readable zoom — no reason to hug the left edge.
      const bounds = { minX: 0, minY: 0, maxX: 600, maxY: 4000 };
      const root = { x: 0, y: 1976, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds,
        root,
        direction: 'horizontal',
        ...pane,
      });

      const leftGap = viewport.x + bounds.minX * viewport.zoom;
      const rightGap = pane.paneWidth - (viewport.x + bounds.maxX * viewport.zoom);
      expect(viewport.zoom).toBe(GRAPH_READABLE_ZOOM);
      expect(leftGap).toBeCloseTo(rightGap);
      expect(viewport.y + (root.y + root.height / 2) * viewport.zoom).toBeCloseTo(
        pane.paneHeight / 2
      );
    });

    it('keeps a shallow vertical graph centered along the layout direction', () => {
      // A wide fan-out in the Vertical layout: its two ranks fit the pane
      // height at the readable zoom, its row of cards does not fit the width.
      const bounds = { minX: 0, minY: 0, maxX: 4000, maxY: 300 };
      const root = { x: 1880, y: 0, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds,
        root,
        direction: 'vertical',
        ...pane,
      });

      const topGap = viewport.y + bounds.minY * viewport.zoom;
      const bottomGap = pane.paneHeight - (viewport.y + bounds.maxY * viewport.zoom);
      expect(viewport.zoom).toBe(GRAPH_READABLE_ZOOM);
      expect(topGap).toBeCloseTo(bottomGap);
      expect(viewport.x + (root.x + root.width / 2) * viewport.zoom).toBeCloseTo(
        pane.paneWidth / 2
      );
    });

    it('centers a graph across the layout direction when it fits there', () => {
      // The layout aligns the root with the median of its relationships, so
      // it can sit near one edge of the tree. When the whole tree fits across
      // the pane, centering on the root would cut cards off for nothing.
      const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 600 };
      const root = { x: 0, y: 0, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds,
        root,
        direction: 'horizontal',
        ...pane,
      });

      const topGap = viewport.y + bounds.minY * viewport.zoom;
      const bottomGap = pane.paneHeight - (viewport.y + bounds.maxY * viewport.zoom);
      expect(topGap).toBeCloseTo(bottomGap);
      expect(viewport.x + root.x * viewport.zoom).toBeCloseTo(GRAPH_ROOT_FOCUS_MARGIN);
    });

    it('stops at the near graph edge instead of centering on a root close to it', () => {
      const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 1000 };
      const root = { x: 0, y: 0, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds,
        root,
        direction: 'horizontal',
        ...pane,
      });

      // Centering on the root would leave ~200 px of empty pane above the
      // graph; the top edge stays at the focus margin instead.
      expect(viewport.y + bounds.minY * viewport.zoom).toBeCloseTo(GRAPH_ROOT_FOCUS_MARGIN);
    });

    it('stops at the far graph edge in the Vertical layout', () => {
      const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 3000 };
      const root = { x: 1760, y: 0, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds,
        root,
        direction: 'vertical',
        ...pane,
      });

      expect(viewport.x + bounds.maxX * viewport.zoom).toBeCloseTo(
        pane.paneWidth - GRAPH_ROOT_FOCUS_MARGIN
      );
      expect(viewport.y + root.y * viewport.zoom).toBeCloseTo(GRAPH_ROOT_FOCUS_MARGIN);
    });

    it('centers a graph that fits the pane even without room for the focus margins', () => {
      // 960 px along the layout direction at the readable zoom, in a 1000 px
      // pane: pinning the root 40 px from the edge would cut the far side off.
      const bounds = { minX: 0, minY: 0, maxX: 1600, maxY: 4000 };
      const root = { x: 0, y: 1976, width: 240, height: 48 };
      const viewport = getInitialGraphViewport({
        fitted: { x: 0, y: 0, zoom: 0.1 },
        bounds,
        root,
        direction: 'horizontal',
        ...pane,
      });

      const leftGap = viewport.x + bounds.minX * viewport.zoom;
      const rightGap = pane.paneWidth - (viewport.x + bounds.maxX * viewport.zoom);
      expect(leftGap).toBeCloseTo(rightGap);
      expect(rightGap).toBeGreaterThanOrEqual(0);
    });
  });
});
