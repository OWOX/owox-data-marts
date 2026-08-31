import { getViewportForBounds, type Viewport } from '@xyflow/react';
import type { CanvasGraphBounds } from '../../../shared/canvas/viewport';

export const GRAPH_ZOOM_MAX = 3;
export const GRAPH_ZOOM_MIN = 0.05;
const GRAPH_ZOOM_EPSILON = 0.0001;
const GRAPH_ZOOM_FALLBACK_MIN = 1;

export interface GraphZoomRange {
  min: number;
  max: number;
}

/**
 * The viewport a full fit lands on for the given graph bounds and pane size —
 * computed with React Flow's own getViewportForBounds (the function fitView
 * uses internally), so the value cannot drift from the library's padding
 * semantics.
 *
 * Derived analytically (instead of asking fitView) because an imperative
 * fitView only fits nodes whose DOM dimensions are already measured, while
 * declared node sizes make the graph count as initialized before measurement —
 * a fit that runs at that point centers on whatever subset happens to be
 * measured. The layout bounds are complete from the first render.
 */
export function getFittedGraphViewport(
  bounds: CanvasGraphBounds,
  paneWidth: number,
  paneHeight: number,
  padding: number
): Viewport | null {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  if (boundsWidth <= 0 || boundsHeight <= 0 || paneWidth <= 0 || paneHeight <= 0) {
    return null;
  }

  return getViewportForBounds(
    { x: bounds.minX, y: bounds.minY, width: boundsWidth, height: boundsHeight },
    paneWidth,
    paneHeight,
    GRAPH_ZOOM_MIN,
    GRAPH_ZOOM_MAX,
    padding
  );
}

export function getGraphZoomRange(fittedZoom: number): GraphZoomRange {
  const safeFittedZoom =
    Number.isFinite(fittedZoom) && fittedZoom > 0
      ? Math.min(fittedZoom, GRAPH_ZOOM_MAX)
      : GRAPH_ZOOM_FALLBACK_MIN;

  return {
    // A small graph on a large pane fits at (or beyond) the max zoom. Keeping
    // min == max there would turn both zoom buttons into no-ops, so fall back
    // to the neutral 100% floor and let the user zoom between 1x and the max.
    min: safeFittedZoom >= GRAPH_ZOOM_MAX ? GRAPH_ZOOM_FALLBACK_MIN : safeFittedZoom,
    max: GRAPH_ZOOM_MAX,
  };
}

export function getNextGraphZoom(
  currentZoom: number,
  delta: number,
  range: GraphZoomRange
): { zoom: number; delta: number } | null {
  if (!Number.isFinite(currentZoom) || currentZoom <= 0) return null;

  const requestedZoom = currentZoom * (1 + delta);
  const zoom = Math.min(Math.max(requestedZoom, range.min), range.max);

  if (!Number.isFinite(zoom) || Math.abs(zoom - currentZoom) < GRAPH_ZOOM_EPSILON) return null;
  // The current zoom can sit outside the range (the measured graph can be
  // slightly larger than the layout sizes the range is derived from). Never
  // let the clamp move the viewport opposite to what the user pressed.
  if (delta > 0 !== zoom > currentZoom) return null;

  return {
    zoom,
    delta: zoom / currentZoom - 1,
  };
}
