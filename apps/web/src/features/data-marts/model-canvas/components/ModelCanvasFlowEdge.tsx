import { useEffect, useRef, useState } from 'react';
import { getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import {
  DIMMED_OPACITY,
  EDGE_COLOR,
  EDGE_STROKE_WIDTH,
  EDGE_WARNING_DASH,
  WARNING_COLOR,
} from '../../shared/canvas/constants';
import type { CanvasDirection } from '../model/graph/canvas-direction';
import { PARALLEL_EDGE_SPACING } from '../model/graph/parallel-edge-offsets';
import { buildRoundedPath, type PathPoint } from '../model/graph/rounded-path';

const EDGE_CORNER_RADIUS = 10;

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
  const pathRef = useRef<SVGPathElement>(null);
  const [midpoint, setMidpoint] = useState<{ x: number; y: number } | null>(null);

  const { route, bowOffset, warning, joinLabel, dimmed, labelPosition, direction } = data;

  let path: string;
  if (route.length > 0) {
    path = buildRoundedPath(
      [{ x: sourceX, y: sourceY }, ...route, { x: targetX, y: targetY }],
      EDGE_CORNER_RADIUS
    );
  } else if (bowOffset !== 0) {
    if (direction === 'vertical') {
      const c = Math.max(40, Math.abs(targetY - sourceY) * 0.3);
      path = `M ${sourceX} ${sourceY} C ${sourceX + bowOffset} ${sourceY + c}, ${targetX + bowOffset} ${targetY - c}, ${targetX} ${targetY}`;
    } else {
      const c = Math.max(40, Math.abs(targetX - sourceX) * 0.3);
      path = `M ${sourceX} ${sourceY} C ${sourceX + c} ${sourceY + bowOffset}, ${targetX - c} ${targetY + bowOffset}, ${targetX} ${targetY}`;
    }
  } else {
    [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  }

  const t = 0.5 + Math.max(-0.18, Math.min(0.18, (bowOffset / PARALLEL_EDGE_SPACING) * 0.24));
  const color = warning ? WARNING_COLOR : EDGE_COLOR;

  useEffect(() => {
    if (labelPosition || joinLabel.length === 0) return;
    const el = pathRef.current;
    if (!el) {
      setMidpoint(null);
      return;
    }
    const len = el.getTotalLength();
    const pt = el.getPointAtLength(len * t);
    setMidpoint({ x: pt.x, y: pt.y });
  }, [path, t, labelPosition, joinLabel]);

  const labelPoint = labelPosition ?? midpoint;

  return (
    <>
      <path
        ref={pathRef}
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
      {joinLabel.length > 0 && labelPoint && (
        <foreignObject
          x={labelPoint.x}
          y={labelPoint.y}
          width={1}
          height={1}
          style={{ overflow: 'visible' }}
        >
          <div
            style={{
              transform: 'translate(-50%, -50%)',
              width: 'max-content',
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
            {joinLabel.map(line => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </foreignObject>
      )}
    </>
  );
}
