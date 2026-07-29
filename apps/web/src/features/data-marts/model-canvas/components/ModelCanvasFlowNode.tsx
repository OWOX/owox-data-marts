import { ExternalLink, Info, KeyRound } from 'lucide-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import { DataMartDefinitionTypeModel } from '../../shared/types/data-mart-definition-type.model';
import { DIMMED_OPACITY, HIGHLIGHT_COLOR, SOCKET_STYLE } from '../../shared/canvas/constants';
import {
  ERD_MAX_VISIBLE_ROWS,
  ERD_NODE_WIDTH,
  computeNodeHeight,
  definitionTypeAccent,
  orderFields,
} from '../model/erd-node';
import type { CanvasNodeField } from '../model/types';
import type { CanvasDirection } from '../model/graph/canvas-direction';

// Re-exported for the layout module; width is fixed, height is per-node.
export const NODE_WIDTH = ERD_NODE_WIDTH;

export interface ModelCanvasFlowNodeData {
  title: string;
  isDraft: boolean;
  fieldCount: number;
  description: string | null;
  definitionType: DataMartDefinitionType | null;
  fields: CanvasNodeField[];
  hasIncoming: boolean;
  hasOutgoing: boolean;
  highlighted: boolean;
  dimmed: boolean;
  direction: CanvasDirection;
  onOpenExternal: () => void;
}

export type ModelCanvasFlowNodeType = Node<
  ModelCanvasFlowNodeData & Record<string, unknown>,
  'modelCanvasNode'
>;

function DefinitionBadge({ type }: { type: DataMartDefinitionType | null }) {
  const info = DataMartDefinitionTypeModel.getInfo(type);
  const color = definitionTypeAccent(type);
  const Icon = info.icon;
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase'
      style={{ background: color }}
    >
      <Icon className='h-2.5 w-2.5' />
      {info.displayName}
    </span>
  );
}

function FieldRow({ field }: { field: CanvasNodeField }) {
  return (
    <div
      className='border-border/60 flex items-center gap-2 border-b px-3 text-[11.5px] last:border-b-0'
      style={{ height: 26, opacity: field.isHidden ? 0.55 : 1 }}
      title={field.isHidden ? `${field.alias} (hidden from reporting)` : field.alias}
    >
      {field.isPrimaryKey ? (
        <KeyRound className='h-3 w-3 shrink-0 text-amber-500' aria-label='Primary key' />
      ) : (
        <span className='w-3 shrink-0' />
      )}
      <span className='text-foreground flex-1 truncate'>{field.alias}</span>
      <span className='text-muted-foreground shrink-0 font-mono text-[10px] tracking-tight'>
        {field.type}
      </span>
    </div>
  );
}

export default function ModelCanvasFlowNode({ data }: NodeProps<ModelCanvasFlowNodeType>) {
  const fields = data.fields;
  const accent = definitionTypeAccent(data.definitionType);
  const height = computeNodeHeight({ fields, fieldCount: data.fieldCount });
  const hasFields = fields.length > 0;

  const ordered = orderFields(fields);
  const visible = ordered.slice(0, ERD_MAX_VISIBLE_ROWS);
  const hiddenCount = ordered.length - visible.length;

  const targetPosition = data.direction === 'vertical' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'vertical' ? Position.Bottom : Position.Right;
  const openExternalLabel = `Open ${data.title} in new tab`;

  function handleExtClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    data.onOpenExternal();
  }

  return (
    <div
      className='bg-background relative flex flex-col overflow-hidden rounded-xl border shadow-sm'
      style={{
        width: NODE_WIDTH,
        height,
        borderColor: data.highlighted ? HIGHLIGHT_COLOR : undefined,
        boxShadow: data.highlighted
          ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
          : undefined,
        opacity: data.dimmed ? DIMMED_OPACITY : 1,
        filter: data.dimmed ? 'grayscale(0.8)' : undefined,
        animation: data.highlighted ? 'node-pulse 1.5s ease-in-out infinite' : undefined,
        transition: 'opacity 0.2s, filter 0.2s',
      }}
    >
      {/* Left accent stripe encodes the definition type. */}
      <span
        className='absolute top-0 bottom-0 left-0 w-1'
        style={{ background: accent }}
        aria-hidden='true'
      />

      {data.hasIncoming && (
        <Handle
          type='target'
          position={targetPosition}
          isConnectable={false}
          style={SOCKET_STYLE}
        />
      )}

      {/* Header: title + actions */}
      <div className='flex items-center gap-1 py-2 pr-2 pl-3.5'>
        <span
          className='text-foreground flex-1 truncate text-[13px] font-semibold'
          title={data.title}
        >
          {data.title}
        </span>
        {data.isDraft && (
          <span className='rounded bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-500 uppercase'>
            Draft
          </span>
        )}
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
                <Info className='h-3.5 w-3.5' aria-hidden='true' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' align='center' role='tooltip' className='max-w-xs'>
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
          <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </div>

      {/* Meta row: definition badge + field count */}
      <div className='flex items-center gap-2 pr-2 pb-2 pl-3.5'>
        <DefinitionBadge type={data.definitionType} />
        <span className='text-muted-foreground text-[11px]'>
          {data.fieldCount} field{data.fieldCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ERD body: field rows */}
      {hasFields && (
        <div className='border-t'>
          {visible.map(field => (
            <FieldRow key={field.name} field={field} />
          ))}
          {hiddenCount > 0 && (
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground hover:bg-muted flex w-full items-center justify-center border-t text-[11px] font-medium transition-colors'
              style={{ height: 26 }}
              onPointerDown={e => {
                e.stopPropagation();
              }}
              onClick={handleExtClick}
              title={openExternalLabel}
            >
              +{hiddenCount} more field{hiddenCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

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
