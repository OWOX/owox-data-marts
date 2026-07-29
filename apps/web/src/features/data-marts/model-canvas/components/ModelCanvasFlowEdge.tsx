import { getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import {
  DIMMED_OPACITY,
  EDGE_STROKE_WIDTH,
  EDGE_WARNING_DASH,
  OWOX_BLUE,
  WARNING_COLOR,
} from '../../shared/canvas/constants';
import type { CanvasDirection } from '../model/graph/canvas-direction';
import type { PathPoint } from '../model/graph/rounded-path';

export interface ModelCanvasFlowEdgeData {
  route: PathPoint[];
  bowOffset: number;
  warning: boolean;
  joinLabel: string[];
  dimmed: boolean;
  labelPosition?: PathPoint;
  direction: CanvasDirection;
}

export type ModelCanvasFlowEdgeType = Edge<
  ModelCanvasFlowEdgeData & Record<string, unknown>,
  'modelCanvasEdge'
> & {
  data: ModelCanvasFlowEdgeData;
};

export default function ModelCanvasFlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  data,
}: EdgeProps<ModelCanvasFlowEdgeType>) {
  const { warning, joinLabel, dimmed } = data;

  // Pure React Flow bezier — smooth curves, no elbow angles.
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = warning ? WARNING_COLOR : OWOX_BLUE;
  // A merged bidirectional edge is a 1:1 link; every other join is child→parent (N:1).
  const cardinality = markerStart ? '1:1' : 'N:1';

  return (
    <>
      <path
        d={path}
        fill='none'
        strokeWidth={EDGE_STROKE_WIDTH}
        stroke={color}
        strokeDasharray={warning ? EDGE_WARNING_DASH : undefined}
        opacity={dimmed ? DIMMED_OPACITY : 1}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{ pointerEvents: 'auto', transition: 'opacity 0.2s' }}
      />
      {joinLabel.length > 0 && (
        <foreignObject x={labelX} y={labelY} width={1} height={1} style={{ overflow: 'visible' }}>
          <div
            style={{
              transform: 'translate(-50%, -50%)',
              width: 'max-content',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--background)',
              border: '1px solid var(--border)',
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
            <div>
              {joinLabel.map(line => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <span
              style={{
                flexShrink: 0,
                borderRadius: 4,
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700,
                background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                color: 'var(--primary)',
              }}
            >
              {cardinality}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}
