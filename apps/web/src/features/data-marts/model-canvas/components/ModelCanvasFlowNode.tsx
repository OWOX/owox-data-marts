import { useEffect, useRef, useState } from 'react';
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
  type CardBadge,
  type CardBadgeKind,
  cardBadgeLines,
  cardBadges,
  nodeLayoutOptions,
  nodeWidth,
} from '../model/erd-node';
import {
  NOTHING_HIDDEN,
  toFieldRowLabels,
  type ObjectLabelsHidden,
} from '../../shared/canvas/object-labels';
import { ErdCardFieldsSection } from '../../shared/canvas/erd-fields-section';
import type { CanvasNodeField, CanvasNodeRelationship } from '../model/types';
import { CardRelationshipsSection } from './CardRelationshipsSection';
import type { CanvasDirection } from '../../shared/canvas/canvas-direction';
import type { DataQualityCompactSummary } from '../../shared/types';
import { DATA_MART_SHARING_TEXTS } from '../../../../shared/components/AvailabilitySheet/data-mart-sharing-texts';
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
  /** The relationships behind `relationshipCount`, listed when its badge is clicked. */
  relationships: CanvasNodeRelationship[];
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
  /** Tells the canvas whether a list on this card runs past it, so the canvas can lift the card. */
  onRaisedChange?: (raised: boolean) => void;
}

const BADGE_ICONS: Record<Exclude<CardBadgeKind, 'definition'>, LucideIcon> = {
  fields: Columns3,
  triggers: CalendarClock,
  reports: FileText,
  relationships: Waypoints,
};

/**
 * Soft-filled pill with a leading icon, as on the product website's Data Mart cards.
 * The layout estimate relies on these classes: keep `px-1.5`, `gap-1` and the `h-3 w-3`
 * icon in sync with `CARD_BADGE_CHROME`, and `text-[11px]` with `CARD_BADGE_FONT_SIZE_PX`.
 */
function CardPill({
  icon: Icon,
  children,
  toggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  /** Makes the pill a button that opens and closes a section of the card. */
  toggle?: { expanded: boolean; label: string; onToggle: () => void };
}) {
  const className =
    'inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-none whitespace-nowrap';
  const content = (
    <>
      <span className='inline-flex shrink-0' aria-hidden='true'>
        <Icon className='h-3 w-3' />
      </span>
      {children}
    </>
  );
  if (!toggle) {
    return <span className={`bg-muted text-muted-foreground ${className}`}>{content}</span>;
  }
  return (
    <button
      type='button'
      className={`nodrag cursor-pointer transition-colors ${className} ${
        toggle.expanded
          ? 'bg-foreground/10 text-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-foreground/10'
      }`}
      aria-expanded={toggle.expanded}
      aria-label={toggle.label}
      title={toggle.label}
      onPointerDown={e => {
        e.stopPropagation();
      }}
      onClick={e => {
        // The card itself toggles its edge highlight on click — keep the two apart.
        e.stopPropagation();
        toggle.onToggle();
      }}
    >
      {content}
    </button>
  );
}

/**
 * A sharing flag in the card footer; renders nothing while the flag is off or
 * unknown. The tooltip names the flag and what it allows, in the words of the
 * Share Data Mart sheet.
 */
function SharingIcon({
  icon: Icon,
  flag,
  on,
}: {
  icon: LucideIcon;
  flag: keyof typeof DATA_MART_SHARING_TEXTS;
  on?: boolean;
}) {
  if (!on) return null;
  const { label, description } = DATA_MART_SHARING_TEXTS[flag];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className='hover:text-foreground nodrag inline-flex cursor-default rounded p-0.5 transition-colors'
          aria-label={label}
          onPointerDown={e => {
            e.stopPropagation();
          }}
        >
          <Icon className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='top' align='end' role='tooltip' className='max-w-xs'>
        <div className='text-xs font-medium'>{label}</div>
        <div className='text-xs opacity-80'>{description}</div>
      </TooltipContent>
    </Tooltip>
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
  // Owned here (not in the section) so expansion survives Compact↔ERD
  // round-trips — the node stays mounted while the section unmounts.
  const [expanded, setExpanded] = useState(false);
  // The section a clicked badge opened: the field list (Compact view) or the relationships.
  const [openSection, setOpenSection] = useState<'fields' | 'relationships' | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  // Expansion grows the card past its layout height, moving the handles —
  // re-measure so edges stay attached to the handle dots.
  useEffect(() => {
    updateNodeInternals(id);
  }, [expanded, openSection, id, updateNodeInternals]);

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
  // Badges fill a line while they fit its width — the layout estimate packs them the same way.
  const badgeLines = cardBadgeLines(data, data.viewMode, nodeLayoutOptions(labels));
  // The ERD view already lists the fields, so there the field count stays a plain badge.
  // A list shows only while its badge does: unticking the badge's object label hides both.
  const canOpenFields = !isErd && fields.length > 0 && badges.fieldCount;
  const canOpenRelationships = data.relationships.length > 0 && badges.relationships;
  const showFields = openSection === 'fields' && canOpenFields;
  const showRelationships = openSection === 'relationships' && canOpenRelationships;
  // A shown list runs past the card's layout height, over the card below — the
  // canvas lifts this card above its neighbours while one is on screen.
  const raised = showFields || showRelationships || (showBody && expanded);
  const onRaisedChangeRef = useRef(data.onRaisedChange);
  onRaisedChangeRef.current = data.onRaisedChange;
  useEffect(() => {
    onRaisedChangeRef.current?.(raised);
  }, [raised]);
  useEffect(
    () => () => {
      onRaisedChangeRef.current?.(false);
    },
    []
  );
  const toggleSection = (section: 'fields' | 'relationships') => {
    setOpenSection(current => (current === section ? null : section));
  };
  const withFooter = !labels.footer;

  const targetPosition = data.direction === 'vertical' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'vertical' ? Position.Bottom : Position.Right;
  const openExternalLabel = `Open ${data.title} in new tab`;

  function renderBadge(badge: CardBadge) {
    if (badge.kind === 'definition') {
      return definitionInfo ? (
        <CardPill key={badge.kind} icon={definitionInfo.icon}>
          {badge.label}
        </CardPill>
      ) : null;
    }
    const toggle =
      badge.kind === 'fields' && canOpenFields
        ? {
            expanded: showFields,
            label: `${showFields ? 'Hide' : 'Show'} fields of ${data.title}`,
            onToggle: () => {
              toggleSection('fields');
            },
          }
        : badge.kind === 'relationships' && canOpenRelationships
          ? {
              expanded: showRelationships,
              label: `${showRelationships ? 'Hide' : 'Show'} relationships of ${data.title}`,
              onToggle: () => {
                toggleSection('relationships');
              },
            }
          : undefined;
    return (
      <CardPill key={badge.kind} icon={BADGE_ICONS[badge.kind]} toggle={toggle}>
        {badge.label}
      </CardPill>
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
      <div className='flex items-center gap-2 pt-3 pr-3 pl-3'>
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

      {/* Badge lines: source, fields, triggers, reports, relationships — packed by width */}
      {badgeLines.map((line, index) => (
        <div
          key={line.map(badge => badge.kind).join('+')}
          className={`flex items-center gap-1 overflow-hidden pr-3 pl-3 ${index === 0 ? 'pt-2' : 'pt-1'}`}
        >
          {line.map(renderBadge)}
        </div>
      ))}

      {/* Without the footer the card still closes with its bottom padding. */}
      {!withFooter && <div className='h-3' aria-hidden='true' />}
      {withFooter && (
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
                flag='availableForReporting'
                on={data.availableForReporting}
              />
              <SharingIcon
                icon={Users}
                flag='availableForMaintenance'
                on={data.availableForMaintenance}
              />
            </span>
          </div>
        </>
      )}

      {/* Sections opened from the badges */}
      {showRelationships && (
        <CardRelationshipsSection dataMartTitle={data.title} relationships={data.relationships} />
      )}
      {showFields && (
        <ErdCardFieldsSection
          fields={fields}
          labels={toFieldRowLabels(labels)}
          expanded={expanded}
          onToggleExpanded={() => {
            setExpanded(v => !v);
          }}
        />
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
