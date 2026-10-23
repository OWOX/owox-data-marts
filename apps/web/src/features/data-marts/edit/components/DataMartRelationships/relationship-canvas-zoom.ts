import { getViewportForBounds, type Rect, type Viewport } from '@xyflow/react';
import type { CanvasDirection } from '../../../shared/canvas/canvas-direction';
import type { CanvasGraphBounds } from '../../../shared/canvas/viewport';

export const GRAPH_ZOOM_MAX = 3;
export const GRAPH_ZOOM_MIN = 0.05;
/**
 * The smallest zoom the graph opens at. Card titles are 13px; below this they
 * shrink under ~8px and the cards can no longer be read without zooming in.
 */
export const GRAPH_READABLE_ZOOM = 0.6;
/** Gap between the pane edge and the root card when the graph opens on it. */
export const GRAPH_ROOT_FOCUS_MARGIN = 40;
const GRAPH_ZOOM_EPSILON = 0.0001;
const GRAPH_ZOOM_FALLBACK_MIN = 1;

export interface GraphZoomRange {
  min: number;
  max: number;
}

export interface InitialGraphViewportInput {
  /** The viewport a full fit lands on (see getFittedGraphViewport). */
  fitted: Viewport;
  bounds: CanvasGraphBounds;
  /** The card of the data mart being edited; null leaves the full fit. */
  root: Rect | null;
  paneWidth: number;
  paneHeight: number;
  direction: CanvasDirection;
}

interface AxisPlacement {
  paneSize: number;
  /** Graph bounds along this axis, in flow coordinates. */
  min: number;
  max: number;
  zoom: number;
  /** The viewport offset that puts the point of interest where it belongs. */
  focusOffset: number;
}

/**
 * The viewport offset along one axis. A graph that fits the pane along it is
 * centered — even with less than the focus margin left on each side, since
 * anchoring it to an edge could cut the far side off. A larger one goes where
 * `focusOffset` puts it, clamped so neither graph edge comes further into the
 * pane than the focus margin — the view never spends pane space beyond the
 * graph while cards are cut off on the other side.
 */
function placeAlongAxis({ paneSize, min, max, zoom, focusOffset }: AxisPlacement): number {
  const extent = (max - min) * zoom;
  if (extent <= paneSize) {
    return (paneSize - extent) / 2 - min * zoom;
  }
  const farEdgeAtPaneEnd = paneSize - GRAPH_ROOT_FOCUS_MARGIN - max * zoom;
  const nearEdgeAtPaneStart = GRAPH_ROOT_FOCUS_MARGIN - min * zoom;
  return Math.min(Math.max(focusOffset, farEdgeAtPaneEnd), nearEdgeAtPaneStart);
}

/**
 * The viewport the graph opens on. A graph that fits at a readable zoom opens
 * fitted whole. A larger one opens at the readable zoom on the root card, so
 * the data mart being edited and its own relationships are what the user sees
 * first; "Fit to view" still shows the whole graph.
 *
 * On each axis the graph is centered while it fits the pane at that zoom.
 * Otherwise, along the layout direction the root card (always on the first
 * rank) is pinned to the leading edge, and across it the view centers on the
 * root card — clamped to the graph bounds, because the layout aligns the root
 * with the median of its relationships, not with the middle of the tree.
 */
export function getInitialGraphViewport({
  fitted,
  bounds,
  root,
  paneWidth,
  paneHeight,
  direction,
}: InitialGraphViewportInput): Viewport {
  if (!root || fitted.zoom >= GRAPH_READABLE_ZOOM) return fitted;

  const zoom = GRAPH_READABLE_ZOOM;
  const horizontal = direction === 'horizontal';
  const pinToLeadingEdge = (rootStart: number) => GRAPH_ROOT_FOCUS_MARGIN - rootStart * zoom;
  const centerOn = (paneSize: number, rootCenter: number) => paneSize / 2 - rootCenter * zoom;

  const x = placeAlongAxis({
    paneSize: paneWidth,
    min: bounds.minX,
    max: bounds.maxX,
    zoom,
    focusOffset: horizontal
      ? pinToLeadingEdge(root.x)
      : centerOn(paneWidth, root.x + root.width / 2),
  });
  const y = placeAlongAxis({
    paneSize: paneHeight,
    min: bounds.minY,
    max: bounds.maxY,
    zoom,
    focusOffset: horizontal
      ? centerOn(paneHeight, root.y + root.height / 2)
      : pinToLeadingEdge(root.y),
  });

  return { x, y, zoom };
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
