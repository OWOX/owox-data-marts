export const GRAPH_ZOOM_MAX = 3;
const GRAPH_ZOOM_EPSILON = 0.0001;
const GRAPH_ZOOM_FALLBACK_MIN = 1;

export interface GraphZoomRange {
  min: number;
  max: number;
}

interface GraphZoomAllowedOptions {
  allowBelowMin?: boolean;
}

export function getGraphZoomRange(fittedZoom: number): GraphZoomRange {
  const safeFittedZoom =
    Number.isFinite(fittedZoom) && fittedZoom > 0
      ? Math.min(fittedZoom, GRAPH_ZOOM_MAX)
      : GRAPH_ZOOM_FALLBACK_MIN;

  return {
    min: safeFittedZoom,
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

  return {
    zoom,
    delta: zoom / currentZoom - 1,
  };
}

export function isGraphZoomAllowed(
  zoom: number,
  range: GraphZoomRange,
  options: GraphZoomAllowedOptions = {}
): boolean {
  const min = options.allowBelowMin ? 0 : range.min - GRAPH_ZOOM_EPSILON;

  return zoom >= min && zoom <= range.max + GRAPH_ZOOM_EPSILON;
}
