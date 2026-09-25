import { useEffect, useState } from 'react';
import {
  CalendarClock,
  Columns3,
  ExternalLink,
  FileText,
  Info,
  PencilLine,
  Share2,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import {
  DIMMED_OPACITY,
  HIGHLIGHT_COLOR,
  OWOX_BLUE,
  SOCKET_STYLE,
} from '../../shared/canvas/constants';
import { DataMartDefinitionTypeModel } from '../../shared/types/data-mart-definition-type.model';
import {
  type CanvasViewMode,
  type CardBadgeRow,
  cardBadgeRows,
  cardBadges,
  nodeLayoutOptions,
  nodeWidth,
} from '../model/erd-node';
import {
  isTitleOnly,
  NOTHING_HIDDEN,
  toFieldRowLabels,
  type ObjectLabelsHidden,
} from '../../shared/canvas/object-labels';
import { ErdCardFieldsSection } from '../../shared/canvas/erd-fields-section';
import type { CanvasNodeField } from '../model/types';
import type { CanvasDirection } from '../../shared/canvas/canvas-direction';
import type { DataQualityCompactSummary } from '../../shared/types';
import { DataQualityCanvasStatusIcon } from './DataQualityCanvasStatusIcon';
import { DataLastUpdatedCanvasIcon } from './DataLastUpdatedCanvasIcon';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';
import type { DataMartIconKey } from '../../shared/enums/data-mart-icon.enum';
import { DataMartIconGlyph } from '../../shared/components/DataMartIcon/DataMartIconGlyph';

export interface ModelCanvasFlowNodeData {
  title: string;
  isDraft: boolean;
  fieldCount: number;
  /** Unknown (undefined) until the detail enrichment resolves — the pill waits for it. */
  triggersCount?: number;
  reportsCount?: number;
  relationshipCount: number;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  description: string | null;
  icon: DataMartIconKey | null;
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

function pluralize(count: number, singular: string): string {
  return `${String(count)} ${singular}${count === 1 ? '' : 's'}`;
}

/** Soft-filled pill with a leading icon, as on the product website's Data Mart cards. */
function CardPill({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className='bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-none whitespace-nowrap'>
      <span className='inline-flex shrink-0' aria-hidden='true'>
        <Icon className='h-3 w-3' />
      </span>
      {children}
    </span>
  );
}

/** A sharing flag in the card footer; renders nothing while the flag is off or unknown. */
function SharingIcon({ icon: Icon, label, on }: { icon: LucideIcon; label: string; on?: boolean }) {
  if (!on) return null;
  return (
    <span className='inline-flex p-0.5' title={label} role='img' aria-label={label}>
      <Icon className='h-3.5 w-3.5' aria-hidden='true' />
    </span>
  );
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

  const isErd = data.viewMode === 'erd';
  const fields = data.fields;
  const showBody = isErd && fields.length > 0;

  const labels = data.objectLabels ?? NOTHING_HIDDEN;
  // A count of zero shows no badge; the layout estimate reads the same rules.
  const badges = cardBadges(data, nodeLayoutOptions(labels));
  const definitionInfo =
    badges.definition && data.definitionType
      ? DataMartDefinitionTypeModel.getInfo(data.definitionType)
      : null;
  // Published is the norm, so only a draft earns a pill — next to the title.
  const withDraft = !labels.status && data.isDraft;
  const badgeRows = cardBadgeRows(badges);
  // "Uncheck all — title only" strips the card down to its name: counts,
  // quality indicators and sharing go too.
  const titleOnly = isTitleOnly(labels);

  const targetPosition = data.direction === 'vertical' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'vertical' ? Position.Bottom : Position.Right;
  const openExternalLabel = `Open ${data.title} in new tab`;

  function renderBadgeRow(row: CardBadgeRow) {
    if (row === 'meta') {
      return (
        <>
          {definitionInfo && (
            <CardPill icon={definitionInfo.icon}>{definitionInfo.displayName}</CardPill>
          )}
          {badges.fieldCount && (
            <CardPill icon={Columns3}>{pluralize(data.fieldCount, 'field')}</CardPill>
          )}
        </>
      );
    }
    if (row === 'usage') {
      return (
        <>
          {badges.triggers && (
            <CardPill icon={CalendarClock}>
              {pluralize(data.triggersCount ?? 0, 'trigger')}
            </CardPill>
          )}
          {badges.reports && (
            <CardPill icon={FileText}>{pluralize(data.reportsCount ?? 0, 'report')}</CardPill>
          )}
        </>
      );
    }
    return (
      <CardPill icon={Waypoints}>{pluralize(data.relationshipCount, 'relationship')}</CardPill>
    );
  }

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

      {/* Title row: icon tile + name + draft pill + actions */}
      <div className={`flex items-center gap-2 pt-3 pr-3 pl-3 ${titleOnly ? 'pb-3' : ''}`}>
        <span
          className='bg-muted text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md'
          aria-hidden='true'
        >
          <DataMartIconGlyph icon={data.icon} className='h-4 w-4' />
        </span>
        <span
          className='text-foreground min-w-0 flex-1 truncate text-sm font-semibold'
          title={data.title}
        >
          {data.title}
        </span>
        {withDraft && <CardPill icon={PencilLine}>Draft</CardPill>}
        {data.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground nodrag inline-flex shrink-0 cursor-default rounded p-0.5 transition-colors'
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

      {/* Badge rows: source + field count, triggers + reports, relationships */}
      {badgeRows.map((row, index) => (
        <div
          key={row}
          className={`flex items-center gap-1 overflow-hidden pr-3 pl-3 ${index === 0 ? 'pt-2' : 'pt-1'}`}
        >
          {renderBadgeRow(row)}
        </div>
      ))}

      {!titleOnly && (
        <>
          {/* Footer: quality shield + Data Last Updated clock, sharing on the right */}
          <div
            className={`text-muted-foreground flex items-center gap-1 pt-2.5 pr-3 pb-3 pl-3 text-[11px]`}
          >
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
            <span className='ml-auto flex items-center gap-1'>
              <SharingIcon
                icon={Share2}
                label='Shared for reporting'
                on={data.availableForReporting}
              />
              <SharingIcon
                icon={Users}
                label='Shared for maintenance'
                on={data.availableForMaintenance}
              />
            </span>
          </div>
        </>
      )}

      {/* ERD body: field rows (only in ERD view) */}
      {showBody && (
        <ErdCardFieldsSection
          fields={fields}
          labels={toFieldRowLabels(labels)}
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
