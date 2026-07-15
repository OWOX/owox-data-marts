import { ExternalLink, Info } from 'lucide-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  DIMMED_OPACITY,
  HIGHLIGHT_COLOR,
  NODE_BORDER_COLOR,
  SOCKET_STYLE,
  WARNING_COLOR,
} from '../../shared/canvas/constants';
import type { CanvasDirection } from '../model/graph/canvas-direction';
import type { DataQualityCompactSummary } from '../../shared/types';
import { DataQualityCanvasStatusIcon } from './DataQualityCanvasStatusIcon';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 74;

export interface ModelCanvasFlowNodeData {
  title: string;
  isDraft: boolean;
  fieldCount: number;
  description: string | null;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  highlighted: boolean;
  dimmed: boolean;
  direction: CanvasDirection;
  onOpenExternal: () => void;
  qualitySummary: DataQualityCompactSummary;
  onOpenQuality: () => void;
  onRunQuality: () => Promise<void>;
}

export type ModelCanvasFlowNodeType = Node<
  ModelCanvasFlowNodeData & Record<string, unknown>,
  'modelCanvasNode'
>;

export default function ModelCanvasFlowNode({ data }: NodeProps<ModelCanvasFlowNodeType>) {
  const borderColor = data.highlighted
    ? HIGHLIGHT_COLOR
    : data.isDraft
      ? WARNING_COLOR
      : NODE_BORDER_COLOR;

  function handleExtClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    data.onOpenExternal();
  }

  const targetPosition = data.direction === 'vertical' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'vertical' ? Position.Bottom : Position.Right;
  const openExternalLabel = `Open ${data.title} in new tab`;

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        borderRadius: 8,
        border: `2px solid ${borderColor}`,
        background: 'var(--background)',
        boxShadow: data.highlighted
          ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
          : '0 1px 4px 0 rgba(0,0,0,0.12)',
        cursor: 'default',
        position: 'relative',
        opacity: data.dimmed ? DIMMED_OPACITY : 1,
        filter: data.dimmed ? 'grayscale(0.8)' : undefined,
        animation: data.highlighted ? 'node-pulse 1.5s ease-in-out infinite' : undefined,
        transition: 'opacity 0.2s, filter 0.2s',
      }}
    >
      {data.isDraft && (
        <span
          style={{
            position: 'absolute',
            top: -18,
            right: 4,
            fontSize: 10,
            fontWeight: 600,
            color: WARNING_COLOR,
            lineHeight: 1,
          }}
        >
          Draft
        </span>
      )}
      {data.hasIncoming && (
        <Handle
          type='target'
          position={targetPosition}
          isConnectable={false}
          style={SOCKET_STYLE}
        />
      )}
      <div
        className='bg-muted flex items-center justify-between'
        style={{
          padding: '8px 10px 8px 14px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: '6px 6px 0 0',
        }}
      >
        <span className='truncate' title={data.title}>
          {data.title}
        </span>
        <div className='ml-2 flex shrink-0 items-center gap-0.5'>
          {data.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground inline-flex cursor-default rounded p-0.5 transition-colors'
                  aria-label={`Description for ${data.title}`}
                  onPointerDown={e => {
                    e.stopPropagation();
                  }}
                >
                  <Info style={{ width: 14, height: 14 }} aria-hidden='true' />
                </button>
              </TooltipTrigger>
              <TooltipContent side='top' align='center' role='tooltip'>
                {data.description}
              </TooltipContent>
            </Tooltip>
          )}
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-0.5 transition-colors'
            onPointerDown={e => {
              e.stopPropagation();
            }}
            onClick={handleExtClick}
            title={openExternalLabel}
            aria-label={openExternalLabel}
          >
            <ExternalLink style={{ width: 14, height: 14 }} aria-hidden='true' />
          </button>
        </div>
      </div>
      <div
        className='text-muted-foreground flex items-center gap-2'
        style={{ padding: '6px 14px 8px', fontSize: 11, minWidth: 0 }}
      >
        <DataQualityCanvasStatusIcon
          dataMartTitle={data.title}
          summary={data.qualitySummary}
          onOpenQuality={data.onOpenQuality}
          onRunQuality={data.onRunQuality}
        />
        <span className='ml-auto shrink-0'>
          {data.fieldCount} field{data.fieldCount !== 1 ? 's' : ''}
        </span>
      </div>
      {data.hasOutgoing && (
        <Handle
          type='source'
          position={sourcePosition}
          isConnectable={false}
          style={SOCKET_STYLE}
        />
      )}
    </div>
  );
}
