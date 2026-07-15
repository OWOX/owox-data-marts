import type { Viewport } from '@xyflow/react';

interface CanvasBoundsNode {
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
}

export interface CanvasGraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getCanvasGraphBounds(nodes: readonly CanvasBoundsNode[]): CanvasGraphBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + (node.width ?? 0));
    maxY = Math.max(maxY, node.position.y + (node.height ?? 0));
  }

  return { minX, minY, maxX, maxY };
}

export function clampCanvasViewport(
  viewport: Viewport,
  bounds: CanvasGraphBounds,
  paneWidth: number,
  paneHeight: number,
  padding: number
): Viewport {
  const minX = padding - bounds.maxX * viewport.zoom;
  const maxX = paneWidth - padding - bounds.minX * viewport.zoom;
  const minY = padding - bounds.maxY * viewport.zoom;
  const maxY = paneHeight - padding - bounds.minY * viewport.zoom;

  return {
    x: Math.min(Math.max(viewport.x, minX), maxX),
    y: Math.min(Math.max(viewport.y, minY), maxY),
    zoom: viewport.zoom,
  };
}
