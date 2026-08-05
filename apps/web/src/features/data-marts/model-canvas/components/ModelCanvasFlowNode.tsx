import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Info, KeyRound } from 'lucide-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import {
  DIMMED_OPACITY,
  HIGHLIGHT_COLOR,
  OWOX_BLUE,
  SOCKET_STYLE,
} from '../../shared/canvas/constants';
import { definitionTypeAccent } from '../../shared/canvas/definition-type-accent';
import { ErdDefinitionBadge, ErdStatusDot } from '../../shared/canvas/erd-card';
import { OWOX_YELLOW_BASE } from '../../shared/canvas/owox-palette';
import { type CanvasViewMode, collapsedRowCount, nodeWidth, orderFields } from '../model/erd-node';
import { NOTHING_HIDDEN, type ObjectLabelsHidden } from '../model/object-labels';
import type { CanvasNodeField } from '../model/types';
import type { CanvasDirection } from '../model/graph/canvas-direction';
import type { DataQualityCompactSummary } from '../../shared/types';
import { DataQualityCanvasStatusIcon } from './DataQualityCanvasStatusIcon';
import { DataLastUpdatedCanvasIcon } from './DataLastUpdatedCanvasIcon';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';

export interface ModelCanvasFlowNodeData {
  title: string;
  isDraft: boolean;
  fieldCount: number;
  description: string | null;
  definitionType: DataMartDefinitionType | null;
  fields: CanvasNodeField[];
  viewMode: CanvasViewMode;
  objectLabels?: ObjectLabelsHidden;
  dataLastUpdated: DataLastUpdatedDto | null;
  isCheckingDataLastUpdated?: boolean;
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

function FieldRow({ field }: { field: CanvasNodeField }) {
  return (
    <div
      className='border-border/50 flex items-center gap-2 border-b px-3.5 py-1.5 text-[11.5px] last:border-b-0'
      style={{ opacity: field.isHidden ? 0.5 : 1 }}
      title={field.isHidden ? `${field.alias} (hidden from reporting)` : field.alias}
    >
      {field.isPrimaryKey ? (
        <KeyRound
          className='h-3 w-3 shrink-0'
          style={{ color: OWOX_YELLOW_BASE }}
          aria-label='Primary key'
        />
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

export default function ModelCanvasFlowNode({
  data,
  selected,
}: NodeProps<ModelCanvasFlowNodeType>) {
  const [expanded, setExpanded] = useState(false);
  const accent = definitionTypeAccent(data.definitionType);
  const isErd = data.viewMode === 'erd';
  const fields = data.fields;
  const showBody = isErd && fields.length > 0;

  // Object labels: the accent stripe and the source badge encode the same
  // definition type, so they show and hide together (as in owox/models).
  const labels = data.objectLabels ?? NOTHING_HIDDEN;
  const withSource = !labels.source;
  const withFieldCount = !labels.fields;
  const withStatus = !labels.status;
  // "Uncheck all — title only" strips the card down to its name: the quality
  // indicators (Data Quality shield + Data Last Updated clock) go too.
  const titleOnly = labels.source && labels.fields && labels.status;

  const ordered = orderFields(fields);
  const collapsed = collapsedRowCount(fields);
  const visible = expanded ? ordered : ordered.slice(0, collapsed);
  const hiddenCount = ordered.length - collapsed;

  const targetPosition = data.direction === 'vertical' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'vertical' ? Position.Bottom : Position.Right;
  const openExternalLabel = `Open ${data.title} in new tab`;

  function handleExtClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    data.onOpenExternal();
  }

  function toggleExpanded(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(v => !v);
  }

  return (
    <div
      className='bg-background relative flex cursor-grab flex-col overflow-hidden rounded-xl border shadow-sm active:cursor-grabbing'
      style={{
        width: nodeWidth(data.viewMode),
        borderColor: data.highlighted ? HIGHLIGHT_COLOR : selected ? OWOX_BLUE : undefined,
        boxShadow: data.highlighted
          ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
          : selected
            ? `0 0 0 1px ${OWOX_BLUE}`
            : undefined,
        opacity: data.dimmed ? DIMMED_OPACITY : 1,
        filter: data.dimmed ? 'grayscale(0.8)' : undefined,
        animation: data.highlighted ? 'node-pulse 1.5s ease-in-out infinite' : undefined,
        transition: 'opacity 0.2s, filter 0.2s',
      }}
    >
      {data.hasIncoming && (
        <Handle
          type='target'
          position={targetPosition}
          isConnectable={false}
          style={SOCKET_STYLE}
        />
      )}

      {/* Header: accent stripe + title + status + actions */}
      <div className={`flex items-center gap-2 px-3.5 pt-3 ${titleOnly ? 'pb-3' : 'pb-1'}`}>
        {withSource && (
          <span
            className='h-4 w-1 shrink-0 rounded-sm'
            style={{ background: accent }}
            aria-hidden='true'
          />
        )}
        <span
          className='text-foreground flex-1 truncate text-[13px] font-semibold'
          title={data.title}
        >
          {data.title}
        </span>
        {withStatus && <ErdStatusDot isDraft={data.isDraft} />}
        {data.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground nodrag inline-flex cursor-default rounded p-0.5 transition-colors'
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
          className='text-muted-foreground hover:text-foreground nodrag shrink-0 cursor-pointer rounded p-0.5 transition-colors'
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

      {/* Meta row: the definition badge on its own line. */}
      {withSource && (
        <div className='text-muted-foreground flex items-center gap-2 px-3.5 pt-1 text-[11px]'>
          <ErdDefinitionBadge type={data.definitionType} />
        </div>
      )}
      {/* Status icons row: quality shield + data-last-updated clock + field count */}
      {!titleOnly && (
        <div className='text-muted-foreground flex items-center gap-1 px-3.5 pt-1 pb-3 text-[11px]'>
          <DataQualityCanvasStatusIcon
            dataMartTitle={data.title}
            summary={data.qualitySummary}
            onOpenQuality={data.onOpenQuality}
            onRunQuality={data.onRunQuality}
          />
          <DataLastUpdatedCanvasIcon
            dataMartTitle={data.title}
            block={data.dataLastUpdated}
            isChecking={data.isCheckingDataLastUpdated}
          />
          {withFieldCount && (
            <span className='ml-auto shrink-0'>
              {data.fieldCount} field{data.fieldCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ERD body: field rows (only in ERD view) */}
      {showBody && (
        <div className='border-t'>
          {visible.map(field => (
            <FieldRow key={field.name} field={field} />
          ))}
          {hiddenCount > 0 && (
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground hover:bg-muted nodrag flex w-full items-center justify-center gap-1 border-t py-1.5 text-[11px] font-medium transition-colors'
              onPointerDown={e => {
                e.stopPropagation();
              }}
              onClick={toggleExpanded}
            >
              {expanded ? (
                <>
                  <ChevronDown className='h-3 w-3' /> Show less
                </>
              ) : (
                <>
                  <ChevronRight className='h-3 w-3' /> +{hiddenCount} more field
                  {hiddenCount !== 1 ? 's' : ''}
                </>
              )}
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
