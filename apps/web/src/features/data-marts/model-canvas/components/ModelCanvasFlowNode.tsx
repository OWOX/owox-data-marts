import { useEffect, useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
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
import { type CanvasViewMode, nodeWidth } from '../model/erd-node';
import { NOTHING_HIDDEN, type ObjectLabelsHidden } from '../../shared/canvas/object-labels';
import { ErdCardFieldsSection } from '../../shared/canvas/erd-fields-section';
import type { CanvasNodeField } from '../model/types';
import type { CanvasDirection } from '../../shared/canvas/canvas-direction';
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

export default function ModelCanvasFlowNode({
  id,
  data,
  selected,
}: NodeProps<ModelCanvasFlowNodeType>) {
  // Owned here (not in the section) so expansion survives Compact↔Detailed
  // round-trips — the node stays mounted while the section unmounts.
  const [expanded, setExpanded] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  // Expansion grows the card past its layout height, moving the handles —
  // re-measure so edges stay attached to the handle dots.
  useEffect(() => {
    updateNodeInternals(id);
  }, [expanded, id, updateNodeInternals]);

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
        <ErdCardFieldsSection
          fields={fields}
          expanded={expanded}
          onToggleExpanded={() => {
            setExpanded(v => !v);
          }}
        />
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
