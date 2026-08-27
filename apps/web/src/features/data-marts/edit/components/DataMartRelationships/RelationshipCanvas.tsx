import { Badge } from '@owox/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  ExternalLink,
  Info,
  Locate,
  Maximize2,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '../../../../../shared/components/Button';
import { useProjectRoute } from '../../../../../shared/hooks';
import {
  DIMMED_OPACITY,
  EDGE_NEUTRAL_COLOR,
  EDGE_SELECTED_STROKE_WIDTH,
  EDGE_STROKE_WIDTH,
  EDGE_WARNING_DASH,
  HIGHLIGHT_COLOR,
  NODE_PULSE_KEYFRAMES,
  OWOX_BLUE,
  SOCKET_STYLE,
  STATIC_NODE_STYLE,
  WARNING_COLOR,
} from '../../../shared/canvas/constants';
import { EdgeArrowMarkers } from '../../../shared/canvas/edge-arrow';
import { edgeMarkerId } from '../../../shared/canvas/edge-marker-id';
import type { CanvasDirection } from '../../../shared/canvas/canvas-direction';
import { CanvasSettingsPopover } from '../../../shared/canvas/canvas-settings-panel';
import {
  estimateEdgeLabelDimensions,
  runDagreLayout,
  type DagreLayoutEdge,
  type DagreLayoutNode,
} from '../../../shared/canvas/dagre-layout';
import { EdgeJoinLabel } from '../../../shared/canvas/edge-join-label';
import {
  ERD_NODE_WIDTH,
  erdFieldsBodyHeight,
  type ErdCardField,
} from '../../../shared/canvas/erd-fields';
import { ErdCardFieldsSection } from '../../../shared/canvas/erd-fields-section';
import type { ObjectLabelsHidden } from '../../../shared/canvas/object-labels';
import type { CanvasViewMode } from '../../../shared/canvas/view-mode';
import { OWOX_GRAY_DARK, OWOX_YELLOW_BASE } from '../../../shared/canvas/owox-palette';
import { definitionTypeAccent } from '../../../shared/canvas/definition-type-accent';
import { ErdDefinitionBadge, ErdStatusDot } from '../../../shared/canvas/erd-card';
import { computeCanvasHighlight, NO_HIGHLIGHT } from '../../../shared/canvas/highlight';
import { clampCanvasViewport, getCanvasGraphBounds } from '../../../shared/canvas/viewport';
import type { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import type {
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';
import { NoAccessIndicatorNative } from './NoAccessIndicator';
import {
  CYCLE_STUB_TOOLTIP,
  getRelationshipIndicator,
  hasConnectionWarning,
  hasNodeWarning,
  isMissingPrimaryKeyWarning,
  MISSING_PRIMARY_KEY_TOOLTIP,
} from './relationship-warning-state';
import {
  GRAPH_ZOOM_MAX,
  GRAPH_ZOOM_MIN,
  getFittedGraphZoom,
  getGraphZoomRange,
  getNextGraphZoom,
} from './relationship-canvas-zoom';
import type { RelationshipStatusFilter } from './relationship-filters';

interface RelationshipCanvasProps {
  dataMartId: string;
  dataMartTitle: string;
  dataMartDescription?: string | null;
  dataMartStatus: string;
  /** Definition type of the root data mart (available from the edit-page context). */
  dataMartDefinitionType?: DataMartDefinitionType | null;
  /** Definition types of target data marts, enriched separately (see useRelationshipDefinitionTypes). */
  definitionTypes?: Map<string, DataMartDefinitionType | null>;
  relationships: DataMartRelationship[];
  relationshipGraph: RelationshipGraph | null;
  connectedFieldCounts?: Map<string, number>;
  searchQuery: string;
  onRequestFullscreen?: () => void;
  /**
   * Toolbar filters, owned by DataMartRelationshipsContent. They apply to the
   * list view as well, and keeping them in the parent also keeps the inline
   * and fullscreen canvas instances in sync.
   */
  showLooped: boolean;
  statusFilter: RelationshipStatusFilter;
  /**
   * View settings (gear popover), owned by DataMartRelationshipsContent for
   * the same inline/fullscreen-sync reason. The gear itself renders inside the
   * canvas, so the change handlers come along.
   */
  viewMode: CanvasViewMode;
  onViewModeChange: (next: CanvasViewMode) => void;
  direction: CanvasDirection;
  onDirectionChange: (next: CanvasDirection) => void;
  showJoinFields: boolean;
  onShowJoinFieldsChange: (checked: boolean) => void;
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
  /** Fields per aliasPath (from the blendable schema) — ERD rows in Detailed view. */
  fieldsByAliasPath?: Map<string, ErdCardField[]>;
  className?: string;
  style?: React.CSSProperties;
}

const NODE_W = 240;
const SRC_H = 48;
const TGT_H = 92;
const FIT_VIEW_SCALE = 0.85;
const FIT_VIEW_PADDING = 1 / FIT_VIEW_SCALE - 1;
const GRAPH_PAN_PADDING = 150;
// Functional "attention" (e.g. missing PK) — corporate yellow, distinct from the
// non-functional (orange) WARNING_COLOR.
const ATTENTION_COLOR = OWOX_YELLOW_BASE;

export interface RelationshipNodeData {
  isSource: boolean;
  label: string;
  targetAlias?: string;
  fieldCount?: number;
  description?: string | null;
  definitionType: DataMartDefinitionType | null;
  isDraft: boolean;
  isBlocked: boolean;
  isJoinNotConfigured: boolean;
  isCycleStub: boolean;
  isMissingPrimaryKey: boolean;
  userHasAccess: boolean;
  hasOutgoing: boolean;
  highlighted: boolean;
  dimmed: boolean;
  /** ERD rows shown in Detailed view; empty when the schema has none for this node. */
  fields: ErdCardField[];
  viewMode: CanvasViewMode;
  objectLabels: ObjectLabelsHidden;
  direction: CanvasDirection;
  onOpenExternal: () => void;
}

export type RelationshipFlowNodeType = Node<
  RelationshipNodeData & Record<string, unknown>,
  'relationshipNode'
>;

interface RelationshipEdgeData {
  warning: boolean;
  dimmed: boolean;
  /** One "source = target" line per join condition; empty unless Show join fields is on. */
  joinLabel: string[];
}

type RelationshipFlowEdgeType = Edge<
  RelationshipEdgeData & Record<string, unknown>,
  'relationshipEdge'
> & { data: RelationshipEdgeData };

/**
 * Floating indicator label above a card (warning or attention kind). Kept as a
 * floating element (not inside the card) so both card variants share it and the
 * accessible warning text stays independent of the card layout.
 */
function IndicatorLabel({ data }: { data: RelationshipNodeData }) {
  const indicator = getRelationshipIndicator(data);
  if (!indicator) return null;
  const isAttention = indicator.kind === 'attention';
  return (
    <span
      title={isAttention ? MISSING_PRIMARY_KEY_TOOLTIP : undefined}
      style={{
        position: 'absolute',
        top: -18,
        right: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontSize: 10,
        fontWeight: 600,
        // The corporate yellow is too light for 10px text (WCAG); keep it on
        // the triangle glyph and use the dark gray for the label itself.
        color: isAttention ? OWOX_GRAY_DARK : WARNING_COLOR,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {isAttention && <TriangleAlert style={{ width: 12, height: 12, color: ATTENTION_COLOR }} />}
      {indicator.label}
    </span>
  );
}

function nodeCardWidth(viewMode: CanvasViewMode): number {
  return viewMode === 'erd' ? ERD_NODE_WIDTH : NODE_W;
}

function cardStateStyle(data: RelationshipNodeData, selected: boolean): React.CSSProperties {
  return {
    width: data.isSource ? NODE_W : nodeCardWidth(data.viewMode),
    borderColor: data.highlighted
      ? HIGHLIGHT_COLOR
      : hasNodeWarning(data)
        ? WARNING_COLOR
        : selected
          ? OWOX_BLUE
          : undefined,
    boxShadow: data.highlighted
      ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
      : selected
        ? `0 0 0 1px ${OWOX_BLUE}`
        : undefined,
    opacity: data.dimmed ? DIMMED_OPACITY : 1,
    filter: data.dimmed ? 'grayscale(0.8)' : undefined,
    animation: data.highlighted ? 'node-pulse 1.5s ease-in-out infinite' : undefined,
    transition: 'opacity 0.2s, filter 0.2s',
    // Cards are clickable (highlight all connections) — advertise it.
    cursor: 'pointer',
  };
}

export function RelationshipFlowNode({ id, data, selected }: NodeProps<RelationshipFlowNodeType>) {
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

  // Object labels mirror the Models canvas: accent stripe + source badge,
  // field count and status dot toggle independently. The alias badge is join
  // configuration (not an object label), so it always stays.
  const labels = data.objectLabels;
  const withSource = !labels.source;
  const withFieldCount = !labels.fields;
  const withStatus = !labels.status;

  const targetPosition = data.direction === 'vertical' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'vertical' ? Position.Bottom : Position.Right;

  function handleExtClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    data.onOpenExternal();
  }

  if (data.isSource) {
    return (
      <div
        className='bg-primary/5 relative flex items-center gap-2 rounded-xl border shadow-sm'
        style={{ ...cardStateStyle(data, selected), height: SRC_H, padding: '0 14px' }}
      >
        <IndicatorLabel data={data} />
        {withSource && (
          <span
            className='h-4 w-1 shrink-0 rounded-sm'
            style={{ background: accent }}
            aria-hidden='true'
          />
        )}
        <span
          className='text-foreground flex-1 truncate text-[13px] font-semibold'
          title={data.label}
        >
          {data.label}
        </span>
        {withStatus && <ErdStatusDot isDraft={data.isDraft} decorative />}
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

  const openExternalLabel = `Open ${data.label} in new tab`;
  const showFieldRows = data.viewMode === 'erd' && data.fields.length > 0;

  return (
    <div
      title={data.isCycleStub ? CYCLE_STUB_TOOLTIP : undefined}
      className='bg-background relative flex flex-col rounded-xl border shadow-sm'
      style={cardStateStyle(data, selected)}
    >
      <IndicatorLabel data={data} />
      <Handle type='target' position={targetPosition} isConnectable={false} style={SOCKET_STYLE} />

      {/* Header: accent stripe + title + status + actions — mirrors the Models canvas ERD card */}
      <div className='flex items-center gap-2 px-3.5 pt-3 pb-1'>
        {withSource && (
          <span
            className='h-4 w-1 shrink-0 rounded-sm'
            style={{ background: accent }}
            aria-hidden='true'
          />
        )}
        <span
          className='text-foreground flex-1 truncate text-[13px] font-semibold'
          title={data.label}
        >
          {data.label}
        </span>
        {withStatus && <ErdStatusDot isDraft={data.isDraft} decorative />}
        {!data.userHasAccess && <NoAccessIndicatorNative />}
        {data.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground inline-flex cursor-default rounded p-0.5 transition-colors'
                aria-label={`Description for ${data.label}`}
                onPointerDown={event => {
                  event.stopPropagation();
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

      {/* Meta row: definition badge + alias + connected field count */}
      <div className='flex min-w-0 items-center gap-2 px-3.5 pt-1 pb-3'>
        {withSource && <ErdDefinitionBadge type={data.definitionType} />}
        {data.targetAlias && (
          <Badge
            variant='secondary'
            className='inline-block max-w-[90px] truncate px-1.5 py-0 text-[10px]'
            title={data.targetAlias}
          >
            {data.targetAlias}
          </Badge>
        )}
        {withFieldCount && (
          <span className='text-muted-foreground ml-auto shrink-0 text-[11px]'>
            {data.fieldCount ?? 0} field{data.fieldCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ERD body: field rows (only in Detailed view) */}
      {showFieldRows && (
        <ErdCardFieldsSection
          fields={data.fields}
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

function RelationshipFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<RelationshipFlowEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  // Gray at rest, brand-blue only when this edge is selected (as in owox/models).
  const color = data.warning ? WARNING_COLOR : selected ? OWOX_BLUE : EDGE_NEUTRAL_COLOR;
  // useId keeps marker ids unique across the inline and fullscreen instances of
  // this diagram (both stay mounted at once) — see ModelCanvasFlowEdge.
  const instanceId = useId();
  const markerId = edgeMarkerId('rel-arrow', instanceId);

  return (
    <>
      <EdgeArrowMarkers markerId={markerId} color={color} withStart={false} />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId}-end)`}
        style={{
          stroke: color,
          strokeWidth: selected ? EDGE_SELECTED_STROKE_WIDTH : EDGE_STROKE_WIDTH,
          strokeDasharray: data.warning ? EDGE_WARNING_DASH : undefined,
          opacity: data.dimmed ? DIMMED_OPACITY : 1,
          transition: 'opacity 0.2s, stroke 0.2s',
        }}
      />
      <EdgeJoinLabel
        x={labelX}
        y={labelY}
        lines={data.joinLabel}
        selected={selected ?? false}
        dimmed={data.dimmed}
      />
    </>
  );
}

const nodeTypes = { relationshipNode: RelationshipFlowNode };
const edgeTypes = { relationshipEdge: RelationshipFlowEdge };

interface NodeInfo {
  dmId: string;
  title: string;
  description?: string | null;
  depth: number;
  isSource: boolean;
  userHasAccess: boolean;
  /** Alias path of the relationship — the key into fieldsByAliasPath. */
  aliasPath?: string;
  targetAlias?: string;
  fieldCount?: number;
  isDraft?: boolean;
  isBlocked?: boolean;
  isJoinNotConfigured?: boolean;
  isCycleStub?: boolean;
  isMissingPrimaryKey?: boolean;
}

interface EdgeInfo {
  sourceId: string;
  targetId: string;
  joinLabel: string[];
}

interface RelationshipFlowGraph {
  nodes: RelationshipFlowNodeType[];
  edges: RelationshipFlowEdgeType[];
  /** Nodes dropped directly by the loop/status filters (their subtrees are dropped on top). */
  filteredOutCount: number;
}

/**
 * Structural fingerprint of the graph: membership and data flags only —
 * deliberately NOT positions or sizes. View-settings toggles (view mode,
 * layout direction, join labels) relayout every node, and keying the reset
 * and auto-fit effects on geometry would wipe the user's pan/zoom and
 * selection on every cosmetic toggle.
 */
function getRelationshipFlowGraphIdentity(graph: RelationshipFlowGraph): string {
  return JSON.stringify([
    graph.nodes.map(node => [
      node.id,
      node.data.isSource,
      node.data.label,
      node.data.targetAlias,
      node.data.fieldCount,
      node.data.description,
      node.data.isDraft,
      node.data.isBlocked,
      node.data.isJoinNotConfigured,
      node.data.isCycleStub,
      node.data.isMissingPrimaryKey,
      node.data.userHasAccess,
      node.data.hasOutgoing,
    ]),
    graph.edges.map(edge => [edge.id, edge.source, edge.target, edge.data.warning]),
  ]);
}

interface BuildRelationshipFlowParams {
  dataMartId: string;
  dataMartTitle: string;
  dataMartDescription: string | null | undefined;
  dataMartStatus: string;
  rootDefinitionType: DataMartDefinitionType | null;
  definitionTypes: Map<string, DataMartDefinitionType | null> | undefined;
  initialRelationships: DataMartRelationship[];
  graph: RelationshipGraph | null;
  fieldCounts: Map<string, number> | undefined;
  /** Cycle stubs multiply quickly on well-connected marts, so they are hidden by default. */
  showLooped: boolean;
  statusFilter: RelationshipStatusFilter;
  viewMode: CanvasViewMode;
  objectLabels: ObjectLabelsHidden;
  direction: CanvasDirection;
  showJoinFields: boolean;
  fieldsByAliasPath: Map<string, ErdCardField[]> | undefined;
  onOpenExternal: (targetDmId: string) => void;
}

/** Collapsed card height — dagre sizes to it, expansion may overlap (as in owox/models). */
function relationshipNodeHeight(
  isSource: boolean,
  fields: ErdCardField[],
  viewMode: CanvasViewMode
): number {
  if (isSource) return SRC_H;
  if (viewMode !== 'erd') return TGT_H;
  return TGT_H + erdFieldsBodyHeight(fields);
}

function buildRelationshipFlow({
  dataMartId,
  dataMartTitle,
  dataMartDescription,
  dataMartStatus,
  rootDefinitionType,
  definitionTypes,
  initialRelationships,
  graph,
  fieldCounts,
  showLooped,
  statusFilter,
  viewMode,
  objectLabels,
  direction,
  showJoinFields,
  fieldsByAliasPath,
  onOpenExternal,
}: BuildRelationshipFlowParams): RelationshipFlowGraph {
  // Filtering a node out also drops its subtree: children can't resolve their
  // parent key and are skipped below. The root data mart is always shown.
  let filteredOutCount = 0;
  const passesFilters = (targetStatus: string, isCycleStub: boolean): boolean => {
    if ((isCycleStub && !showLooped) || (statusFilter !== 'all' && targetStatus !== statusFilter)) {
      filteredOutCount++;
      return false;
    }
    return true;
  };
  const nodeInfos = new Map<string, NodeInfo>();
  const edgeInfos: EdgeInfo[] = [];
  const hasOutgoing = new Set<string>();

  const rootIsDraft = dataMartStatus === 'DRAFT';

  nodeInfos.set(dataMartId, {
    dmId: dataMartId,
    title: dataMartTitle,
    description: dataMartDescription,
    depth: 0,
    isSource: true,
    isDraft: rootIsDraft,
    userHasAccess: true,
  });

  const aliasPathToNodeKey = new Map<string, string>();
  aliasPathToNodeKey.set('', dataMartId);

  function addEdgeAndNode(
    parentNodeKey: string,
    dmId: string,
    info: Omit<NodeInfo, 'dmId' | 'aliasPath'>,
    aliasPath: string,
    joinConditions: DataMartRelationship['joinConditions']
  ): void {
    // Alias paths are unique within the graph, so keying nodes by them keeps
    // ids stable when filters drop earlier nodes (a positional counter would
    // shift every id and remount every node on a filter toggle).
    const nodeKey = `path:${aliasPath}`;
    edgeInfos.push({
      sourceId: parentNodeKey,
      targetId: nodeKey,
      joinLabel: showJoinFields
        ? joinConditions.map(c => `${c.sourceFieldName} = ${c.targetFieldName}`)
        : [],
    });
    hasOutgoing.add(parentNodeKey);
    nodeInfos.set(nodeKey, { dmId, aliasPath, ...info });
    aliasPathToNodeKey.set(aliasPath, nodeKey);
  }

  if (graph) {
    for (const node of graph.nodes) {
      const lastDot = node.aliasPath.lastIndexOf('.');
      const parentAliasPath = lastDot === -1 ? '' : node.aliasPath.slice(0, lastDot);
      const parentNodeKey = aliasPathToNodeKey.get(parentAliasPath);
      if (!parentNodeKey) continue;
      if (!passesFilters(node.relationship.targetDataMart.status, node.isCycleStub)) continue;
      addEdgeAndNode(
        parentNodeKey,
        node.relationship.targetDataMart.id,
        {
          title: node.relationship.targetDataMart.title,
          description: node.relationship.targetDataMart.description,
          depth: node.depth,
          isSource: false,
          targetAlias: node.relationship.targetAlias,
          fieldCount: fieldCounts?.get(node.relationship.id) ?? 0,
          isDraft: node.relationship.targetDataMart.status === 'DRAFT',
          isBlocked: node.isBlocked,
          isJoinNotConfigured: node.relationship.joinConditions.length === 0,
          isCycleStub: node.isCycleStub,
          isMissingPrimaryKey: isMissingPrimaryKeyWarning(
            node.relationship.targetDataMart.hasPrimaryKey,
            node.relationship.joinConditions.length
          ),
          userHasAccess: node.relationship.targetDataMart.userHasAccess,
        },
        node.aliasPath,
        node.relationship.joinConditions
      );
    }
  } else {
    for (const rel of initialRelationships) {
      if (!passesFilters(rel.targetDataMart.status, rel.targetDataMart.id === dataMartId)) continue;
      addEdgeAndNode(
        dataMartId,
        rel.targetDataMart.id,
        {
          title: rel.targetDataMart.title,
          description: rel.targetDataMart.description,
          depth: 1,
          isSource: false,
          targetAlias: rel.targetAlias,
          fieldCount: fieldCounts?.get(rel.id) ?? 0,
          isDraft: rel.targetDataMart.status === 'DRAFT',
          isBlocked: rootIsDraft,
          isJoinNotConfigured: rel.joinConditions.length === 0,
          isCycleStub: rel.targetDataMart.id === dataMartId,
          isMissingPrimaryKey: isMissingPrimaryKeyWarning(
            rel.targetDataMart.hasPrimaryKey,
            rel.joinConditions.length
          ),
          userHasAccess: rel.targetDataMart.userHasAccess,
        },
        rel.targetAlias,
        rel.joinConditions
      );
    }
  }

  const fields = new Map<string, ErdCardField[]>();
  const widths = new Map<string, number>();
  const heights = new Map<string, number>();
  for (const [nodeKey, info] of nodeInfos) {
    const nodeFields =
      info.isSource || info.aliasPath === undefined
        ? []
        : (fieldsByAliasPath?.get(info.aliasPath) ?? []);
    fields.set(nodeKey, nodeFields);
    widths.set(nodeKey, info.isSource ? NODE_W : nodeCardWidth(viewMode));
    heights.set(nodeKey, relationshipNodeHeight(info.isSource, nodeFields, viewMode));
  }

  // Same layout engine as the Models canvas: dagre picks the positions and
  // reserves room for join labels, honoring the Horizontal/Vertical setting.
  const dagreNodes: DagreLayoutNode[] = [...nodeInfos.keys()].map(nodeKey => ({
    id: nodeKey,
    width: widths.get(nodeKey) ?? NODE_W,
    height: heights.get(nodeKey) ?? TGT_H,
  }));
  const dagreEdges: DagreLayoutEdge[] = edgeInfos.map(edge => ({
    id: `${edge.sourceId}->${edge.targetId}`,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    label: estimateEdgeLabelDimensions(edge.joinLabel),
  }));
  const { positions } = runDagreLayout(dagreNodes, dagreEdges, direction);

  const nodes: RelationshipFlowNodeType[] = [];
  for (const [nodeKey, info] of nodeInfos) {
    nodes.push({
      id: nodeKey,
      type: 'relationshipNode',
      position: positions.get(nodeKey) ?? { x: 0, y: 0 },
      width: widths.get(nodeKey) ?? NODE_W,
      height: heights.get(nodeKey) ?? TGT_H,
      draggable: false,
      selectable: false,
      focusable: false,
      style: STATIC_NODE_STYLE,
      data: {
        isSource: info.isSource,
        label: info.title,
        targetAlias: info.targetAlias,
        fieldCount: info.fieldCount,
        description: info.description,
        definitionType: info.isSource
          ? rootDefinitionType
          : (definitionTypes?.get(info.dmId) ?? null),
        isDraft: info.isDraft ?? false,
        isBlocked: info.isBlocked ?? false,
        isJoinNotConfigured: info.isJoinNotConfigured ?? false,
        isCycleStub: info.isCycleStub ?? false,
        isMissingPrimaryKey: info.isMissingPrimaryKey ?? false,
        userHasAccess: info.userHasAccess,
        hasOutgoing: hasOutgoing.has(nodeKey) && !info.isCycleStub,
        highlighted: false,
        dimmed: false,
        fields: fields.get(nodeKey) ?? [],
        viewMode,
        objectLabels,
        direction,
        onOpenExternal: () => {
          onOpenExternal(info.dmId);
        },
      },
    });
  }

  const edges: RelationshipFlowEdgeType[] = [];
  for (const edge of edgeInfos) {
    const src = nodeInfos.get(edge.sourceId);
    const tgt = nodeInfos.get(edge.targetId);
    if (!src || !tgt) continue;
    // Attention-kind endpoints (e.g. missing PK) intentionally do NOT color the edge — the join works.
    const warning = hasConnectionWarning(src, tgt);

    edges.push({
      id: `${edge.sourceId}->${edge.targetId}`,
      type: 'relationshipEdge',
      source: edge.sourceId,
      target: edge.targetId,
      focusable: false,
      selectable: false,
      data: { warning, dimmed: false, joinLabel: edge.joinLabel },
    });
  }

  return { nodes, edges, filteredOutCount };
}

interface RelationshipCanvasInnerProps {
  dataMartId: string;
  dataMartTitle: string;
  dataMartDescription?: string | null;
  dataMartStatus: string;
  dataMartDefinitionType?: DataMartDefinitionType | null;
  definitionTypes?: Map<string, DataMartDefinitionType | null>;
  relationships: DataMartRelationship[];
  relationshipGraph: RelationshipGraph | null;
  connectedFieldCounts?: Map<string, number>;
  searchQuery: string;
  onRequestFullscreen?: () => void;
  onOpenExternal: (targetId: string) => void;
  /** Toolbar filters — see RelationshipCanvasProps. */
  showLooped: boolean;
  statusFilter: RelationshipStatusFilter;
  /** View settings — see RelationshipCanvasProps. */
  viewMode: CanvasViewMode;
  onViewModeChange: (next: CanvasViewMode) => void;
  direction: CanvasDirection;
  onDirectionChange: (next: CanvasDirection) => void;
  showJoinFields: boolean;
  onShowJoinFieldsChange: (checked: boolean) => void;
  objectLabels: ObjectLabelsHidden;
  onObjectLabelsChange: (next: ObjectLabelsHidden) => void;
  fieldsByAliasPath?: Map<string, ErdCardField[]>;
}

function RelationshipCanvasInner({
  dataMartId,
  dataMartTitle,
  dataMartDescription,
  dataMartStatus,
  dataMartDefinitionType,
  definitionTypes,
  relationships,
  relationshipGraph,
  connectedFieldCounts,
  searchQuery,
  onRequestFullscreen,
  onOpenExternal,
  showLooped,
  statusFilter,
  viewMode,
  onViewModeChange,
  direction,
  onDirectionChange,
  showJoinFields,
  onShowJoinFieldsChange,
  objectLabels,
  onObjectLabelsChange,
  fieldsByAliasPath,
}: RelationshipCanvasInnerProps) {
  const reactFlow = useReactFlow<RelationshipFlowNodeType, RelationshipFlowEdgeType>();
  const paneWidth = useStore(s => s.width);
  const paneHeight = useStore(s => s.height);
  const hasFitRef = useRef(false);
  const userInteractedRef = useRef(false);

  const graphResult = useMemo(
    () =>
      buildRelationshipFlow({
        dataMartId,
        dataMartTitle,
        dataMartDescription,
        dataMartStatus,
        rootDefinitionType: dataMartDefinitionType ?? null,
        definitionTypes,
        initialRelationships: relationships,
        graph: relationshipGraph,
        fieldCounts: connectedFieldCounts,
        showLooped,
        statusFilter,
        viewMode,
        objectLabels,
        direction,
        showJoinFields,
        fieldsByAliasPath,
        onOpenExternal,
      }),
    [
      dataMartId,
      dataMartTitle,
      dataMartDescription,
      dataMartStatus,
      dataMartDefinitionType,
      definitionTypes,
      relationships,
      relationshipGraph,
      connectedFieldCounts,
      showLooped,
      statusFilter,
      viewMode,
      objectLabels,
      direction,
      showJoinFields,
      fieldsByAliasPath,
      onOpenExternal,
    ]
  );

  // Selection is tracked manually (the graph is memo-derived, not React Flow
  // state). Clicking an edge highlights just that edge; clicking a data mart
  // card highlights every edge connected to it, so all of its relationships
  // are visible at once. Pane click (or a repeat click) clears.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const graphIdentity = useMemo(() => getRelationshipFlowGraphIdentity(graphResult), [graphResult]);
  const graphBounds = useMemo(() => getCanvasGraphBounds(graphResult.nodes), [graphResult.nodes]);
  const previousGraphIdentityRef = useRef(graphIdentity);

  // Derived from the live geometry (not captured after a fit): a fit that ran
  // against a half-loaded graph or a still-settling pane used to freeze the
  // range in a state where both zoom buttons were dead until "Fit to view"
  // recomputed it — the exact "zoom stops working after opening the page via
  // search" bug.
  const zoomRange = useMemo(
    () =>
      getGraphZoomRange(getFittedGraphZoom(graphBounds, paneWidth, paneHeight, FIT_VIEW_PADDING)),
    [graphBounds, paneWidth, paneHeight]
  );

  useEffect(() => {
    if (previousGraphIdentityRef.current === graphIdentity) return;
    previousGraphIdentityRef.current = graphIdentity;
    userInteractedRef.current = false;
    // Node keys are aliasPath-stable, so a settings toggle (view mode,
    // layout, join fields) relayouts without renaming anything — keep the
    // selection when its target survived, drop it only when the node/edge is
    // actually gone (filters, data changes).
    setSelectedNodeId(current =>
      current !== null && graphResult.nodes.some(node => node.id === current) ? current : null
    );
    setSelectedEdgeId(current =>
      current !== null && graphResult.edges.some(edge => edge.id === current) ? current : null
    );
  }, [graphIdentity, graphResult]);

  const highlightState = useMemo(
    () =>
      computeCanvasHighlight(
        graphResult.nodes,
        searchQuery,
        node => node.id,
        node => node.data.label
      ),
    [graphResult.nodes, searchQuery]
  );

  const flowNodes = useMemo(
    () =>
      graphResult.nodes.map(node => {
        const state = highlightState.get(node.id) ?? NO_HIGHLIGHT;
        const selected = node.id === selectedNodeId;
        return node.data.highlighted === state.highlighted &&
          node.data.dimmed === state.dimmed &&
          (node.selected ?? false) === selected
          ? node
          : { ...node, selected, data: { ...node.data, ...state } };
      }),
    [graphResult.nodes, highlightState, selectedNodeId]
  );

  const flowEdges = useMemo(
    () =>
      graphResult.edges.map(edge => {
        const dimmed =
          (highlightState.get(edge.source)?.dimmed ?? false) &&
          (highlightState.get(edge.target)?.dimmed ?? false);
        const selected =
          edge.id === selectedEdgeId ||
          (selectedNodeId !== null &&
            (edge.source === selectedNodeId || edge.target === selectedNodeId));
        return edge.data.dimmed === dimmed && (edge.selected ?? false) === selected
          ? edge
          : { ...edge, selected, data: { ...edge.data, dimmed } };
      }),
    [graphResult.edges, highlightState, selectedEdgeId, selectedNodeId]
  );

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: { id: string }) => {
    setSelectedEdgeId(current => (current === edge.id ? null : edge.id));
    setSelectedNodeId(null);
  }, []);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(current => (current === node.id ? null : node.id));
    setSelectedEdgeId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  }, []);

  const highlightStateRef = useRef(highlightState);
  highlightStateRef.current = highlightState;

  const zoomToMatches = useCallback(() => {
    const matchingIds = [...highlightStateRef.current.entries()]
      .filter(([, s]) => s.highlighted)
      .map(([id]) => id);
    if (matchingIds.length === 0) return;
    void reactFlow.fitView({
      nodes: matchingIds.map(id => ({ id })),
      duration: 300,
      padding: FIT_VIEW_PADDING,
    });
  }, [reactFlow]);

  const fitFull = useCallback(() => {
    return reactFlow.fitView({
      minZoom: GRAPH_ZOOM_MIN,
      maxZoom: GRAPH_ZOOM_MAX,
      padding: FIT_VIEW_PADDING,
    });
  }, [reactFlow]);

  const markUserInteracted = useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  useEffect(() => {
    if (paneWidth === 0 || paneHeight === 0) return;
    if (userInteractedRef.current) return;
    void fitFull().then(() => {
      hasFitRef.current = true;
      zoomToMatches();
    });
    // graphIdentity (not graphResult): an identical-content rebuild — e.g. a
    // schema refetch producing byte-equal fields — must not re-run the fit.
  }, [paneWidth, paneHeight, graphIdentity, fitFull, zoomToMatches]);

  useEffect(() => {
    if (!hasFitRef.current) return;
    zoomToMatches();
  }, [highlightState, zoomToMatches]);

  const handleZoom = useCallback(
    (delta: number) => {
      markUserInteracted();
      const currentZoom = reactFlow.getZoom();
      if (!Number.isFinite(currentZoom) || currentZoom <= 0) {
        // A corrupted viewport (an interrupted init can leave a non-finite
        // transform behind) would make every zoom step a silent no-op —
        // recover with a full fit instead of ignoring the click.
        void fitFull();
        return;
      }
      const next = getNextGraphZoom(currentZoom, delta, zoomRange);
      if (!next) return;
      void reactFlow.zoomTo(next.zoom, { duration: 150 });
    },
    [fitFull, markUserInteracted, reactFlow, zoomRange]
  );

  const handleMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (paneWidth === 0 || paneHeight === 0) return;
      // A non-finite zoom would poison the clamp math and push a NaN viewport
      // into React Flow, killing pan and zoom until a full fit.
      if (!Number.isFinite(viewport.zoom)) return;

      const clampedViewport = clampCanvasViewport(
        viewport,
        graphBounds,
        paneWidth,
        paneHeight,
        GRAPH_PAN_PADDING
      );
      if (clampedViewport.x === viewport.x && clampedViewport.y === viewport.y) return;

      void reactFlow.setViewport(clampedViewport);
    },
    [graphBounds, paneHeight, paneWidth, reactFlow]
  );

  return (
    <>
      <div className='absolute top-3 right-3 z-10 flex items-start gap-2'>
        <div className='flex flex-col gap-1.5'>
          <Button
            variant='outline'
            size='icon'
            className='h-12 w-12'
            onClick={() => {
              markUserInteracted();
              void fitFull();
            }}
            aria-label='Fit to view'
          >
            <Locate className='h-6 w-6' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='h-12 w-12'
            onClick={() => {
              handleZoom(0.25);
            }}
            aria-label='Zoom in'
          >
            <ZoomIn className='h-6 w-6' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='h-12 w-12'
            onClick={() => {
              handleZoom(-0.25);
            }}
            aria-label='Zoom out'
          >
            <ZoomOut className='h-6 w-6' />
          </Button>
          {onRequestFullscreen && (
            <Button
              variant='outline'
              size='icon'
              className='h-12 w-12'
              onClick={onRequestFullscreen}
              aria-label='Expand diagram'
            >
              <Maximize2 className='h-6 w-6' />
            </Button>
          )}
          <CanvasSettingsPopover
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            direction={direction}
            onDirectionChange={onDirectionChange}
            showJoinFields={showJoinFields}
            onShowJoinFieldsChange={onShowJoinFieldsChange}
            objectLabels={objectLabels}
            onObjectLabelsChange={onObjectLabelsChange}
          />
        </div>
      </div>
      <div
        className='h-full w-full'
        onPointerDownCapture={markUserInteracted}
        onWheelCapture={markUserInteracted}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          zoomOnDoubleClick={false}
          minZoom={zoomRange.min}
          maxZoom={zoomRange.max}
          onEdgeClick={handleEdgeClick}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          deleteKeyCode={null}
          // React Flow's key hooks listen on the whole document and preventDefault their
          // matches. Monaco's EditContext input is a plain div, which xyflow's is-input check
          // does not recognize, so with the default Space pan shortcut this embedded canvas
          // silently ate every space typed into the SQL editor above it. No canvas shortcut
          // is worth a global key grab on a form page.
          panActivationKeyCode={null}
          onMove={handleMove}
          onMoveStart={(event: unknown) => {
            if (event) markUserInteracted();
          }}
          proOptions={{ hideAttribution: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <MiniMap<RelationshipFlowNodeType>
            pannable
            zoomable
            style={{ width: 140, height: 100 }}
            nodeColor={node => definitionTypeAccent(node.data.definitionType)}
          />
        </ReactFlow>
        {graphResult.nodes.length === 1 && graphResult.filteredOutCount > 0 && (
          <div className='pointer-events-none absolute inset-x-0 bottom-6 flex justify-center'>
            <span className='bg-background text-muted-foreground rounded-md border px-3 py-1.5 text-sm shadow-sm'>
              No related data marts match the current filters
            </span>
          </div>
        )}
      </div>
    </>
  );
}

export function RelationshipCanvas({
  dataMartId,
  dataMartTitle,
  dataMartDescription,
  dataMartStatus,
  dataMartDefinitionType,
  definitionTypes,
  relationships,
  relationshipGraph,
  connectedFieldCounts,
  searchQuery,
  onRequestFullscreen,
  showLooped,
  statusFilter,
  viewMode,
  onViewModeChange,
  direction,
  onDirectionChange,
  showJoinFields,
  onShowJoinFieldsChange,
  objectLabels,
  onObjectLabelsChange,
  fieldsByAliasPath,
  className,
  style,
}: RelationshipCanvasProps) {
  const { scope } = useProjectRoute();
  const handleOpenExternal = useCallback(
    (targetId: string) => {
      window.open(scope(`/data-marts/${targetId}/data-setup`), '_blank', 'noopener,noreferrer');
    },
    [scope]
  );

  if (relationships.length === 0) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${className ?? ''}`}
      style={style ?? { height: 480 }}
    >
      <style>{NODE_PULSE_KEYFRAMES}</style>
      <ReactFlowProvider>
        <RelationshipCanvasInner
          dataMartId={dataMartId}
          dataMartTitle={dataMartTitle}
          dataMartDescription={dataMartDescription}
          dataMartStatus={dataMartStatus}
          dataMartDefinitionType={dataMartDefinitionType}
          definitionTypes={definitionTypes}
          relationships={relationships}
          relationshipGraph={relationshipGraph}
          connectedFieldCounts={connectedFieldCounts}
          searchQuery={searchQuery}
          onRequestFullscreen={onRequestFullscreen}
          onOpenExternal={handleOpenExternal}
          showLooped={showLooped}
          statusFilter={statusFilter}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          direction={direction}
          onDirectionChange={onDirectionChange}
          showJoinFields={showJoinFields}
          onShowJoinFieldsChange={onShowJoinFieldsChange}
          objectLabels={objectLabels}
          onObjectLabelsChange={onObjectLabelsChange}
          fieldsByAliasPath={fieldsByAliasPath}
        />
      </ReactFlowProvider>
    </div>
  );
}
