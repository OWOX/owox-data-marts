import { useId } from 'react';
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import {
  DIMMED_OPACITY,
  EDGE_NEUTRAL_COLOR,
  EDGE_SELECTED_STROKE_WIDTH,
  EDGE_STROKE_WIDTH,
  EDGE_WARNING_DASH,
  OWOX_BLUE,
  WARNING_COLOR,
} from '../../shared/canvas/constants';
import { EdgeArrowMarkers } from '../../shared/canvas/edge-arrow';
import { edgeMarkerId } from '../../shared/canvas/edge-marker-id';
import type { CanvasDirection } from '../model/graph/canvas-direction';

export interface ModelCanvasFlowEdgeData {
  bowOffset: number;
  warning: boolean;
  joinLabel: string[];
  dimmed: boolean;
  direction: CanvasDirection;
  bidirectional: boolean;
}

export type ModelCanvasFlowEdgeType = Edge<
  ModelCanvasFlowEdgeData & Record<string, unknown>,
  'modelCanvasEdge'
> & {
  data: ModelCanvasFlowEdgeData;
};

interface BezierGeometry {
  path: string;
  labelX: number;
  labelY: number;
}

/**
 * Parallel edges between the same node pair share identical endpoints, so the
 * default bezier would draw them on top of each other. A non-zero bowOffset
 * bows the curve sideways (perpendicular to the layout direction) to keep each
 * edge — and its label — visually distinct.
 */
function getBowedBezier(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  bowOffset: number,
  direction: CanvasDirection
): BezierGeometry {
  let c1x: number, c1y: number, c2x: number, c2y: number;
  if (direction === 'vertical') {
    const c = Math.max(40, Math.abs(targetY - sourceY) * 0.3);
    c1x = sourceX + bowOffset;
    c1y = sourceY + c;
    c2x = targetX + bowOffset;
    c2y = targetY - c;
  } else {
    const c = Math.max(40, Math.abs(targetX - sourceX) * 0.3);
    c1x = sourceX + c;
    c1y = sourceY + bowOffset;
    c2x = targetX - c;
    c2y = targetY + bowOffset;
  }
  return {
    path: `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`,
    // Cubic bezier midpoint (t = 0.5): (S + 3·C1 + 3·C2 + T) / 8.
    labelX: (sourceX + 3 * c1x + 3 * c2x + targetX) / 8,
    labelY: (sourceY + 3 * c1y + 3 * c2y + targetY) / 8,
  };
}

export default function ModelCanvasFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<ModelCanvasFlowEdgeType>) {
  const { bowOffset, warning, joinLabel, dimmed, direction, bidirectional } = data;

  let geometry: BezierGeometry;
  if (bowOffset !== 0) {
    geometry = getBowedBezier(sourceX, sourceY, targetX, targetY, bowOffset, direction);
  } else {
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    geometry = { path, labelX, labelY };
  }

  const color = warning ? WARNING_COLOR : selected ? OWOX_BLUE : EDGE_NEUTRAL_COLOR;
  // useId is unique per rendered edge element, so two mounted canvases (e.g.
  // inline + fullscreen) can never emit duplicate SVG marker ids — a duplicate
  // would make url(#…) resolve to the *other* instance's marker and freeze the
  // arrowhead color there.
  const instanceId = useId();
  const markerId = edgeMarkerId('mc-arrow', instanceId);

  return (
    <>
      <EdgeArrowMarkers markerId={markerId} color={color} withStart={bidirectional} />
      <BaseEdge
        id={id}
        path={geometry.path}
        markerEnd={`url(#${markerId}-end)`}
        markerStart={bidirectional ? `url(#${markerId}-start)` : undefined}
        style={{
          stroke: color,
          strokeWidth: selected ? EDGE_SELECTED_STROKE_WIDTH : EDGE_STROKE_WIDTH,
          strokeDasharray: warning ? EDGE_WARNING_DASH : undefined,
          opacity: dimmed ? DIMMED_OPACITY : 1,
          transition: 'opacity 0.2s, stroke 0.2s',
        }}
      />
      {joinLabel.length > 0 && (
        <foreignObject
          x={geometry.labelX}
          y={geometry.labelY}
          width={1}
          height={1}
          style={{ overflow: 'visible' }}
        >
          <div
            style={{
              transform: 'translate(-50%, -50%)',
              width: 'max-content',
              background: 'var(--background)',
              border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.5,
              color: 'var(--foreground)',
              pointerEvents: 'none',
              opacity: dimmed ? DIMMED_OPACITY : 1,
              transition: 'opacity 0.2s',
              boxShadow: '0 1px 3px 0 rgba(0,0,0,0.08)',
            }}
          >
            {joinLabel.map(line => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </foreignObject>
      )}
    </>
  );
}
