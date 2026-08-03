import { Badge } from '@owox/ui/components/badge';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  Check,
  ExternalLink,
  Info,
  Locate,
  Maximize2,
  Settings,
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
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '../../../../../shared/components/Button';
import { useProjectRoute } from '../../../../../shared/hooks';
import { storageService } from '../../../../../services/localstorage.service';
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
  getGraphZoomRange,
  getNextGraphZoom,
  type GraphZoomRange,
} from './relationship-canvas-zoom';
import {
  parseRelationshipStatusFilter,
  RELATIONSHIP_STATUS_FILTER_OPTIONS,
  type RelationshipStatusFilter,
} from './relationship-canvas-filters';

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
  /** Controlled diagram filters — see RelationshipCanvasInnerProps. */
  showLooped?: boolean;
  onShowLoopedChange?: (checked: boolean) => void;
  statusFilter?: RelationshipStatusFilter;
  onStatusFilterChange?: (next: RelationshipStatusFilter) => void;
  className?: string;
  style?: React.CSSProperties;
}

const NODE_W = 240;
const SRC_H = 48;
const TGT_H = 92;

const SHOW_LOOPED_LS_KEY = 'relationship-canvas-show-looped';
const STATUS_FILTER_LS_KEY = 'relationship-canvas-status-filter';
const H_GAP = 280;
const V_GAP = 24;
const FIT_VIEW_SCALE = 0.85;
const FIT_VIEW_PADDING = 1 / FIT_VIEW_SCALE - 1;
const GRAPH_ZOOM_MIN = 0.05;
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
  onOpenExternal: () => void;
}

export type RelationshipFlowNodeType = Node<
  RelationshipNodeData & Record<string, unknown>,
  'relationshipNode'
>;

interface RelationshipEdgeData {
  warning: boolean;
  dimmed: boolean;
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

function cardStateStyle(data: RelationshipNodeData, selected: boolean): React.CSSProperties {
  return {
    width: NODE_W,
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

export function RelationshipFlowNode({ data, selected }: NodeProps<RelationshipFlowNodeType>) {
  const accent = definitionTypeAccent(data.definitionType);

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
        <span
          className='h-4 w-1 shrink-0 rounded-sm'
          style={{ background: accent }}
          aria-hidden='true'
        />
        <span
          className='text-foreground flex-1 truncate text-[13px] font-semibold'
          title={data.label}
        >
          {data.label}
        </span>
        <ErdStatusDot isDraft={data.isDraft} decorative />
        {data.hasOutgoing && (
          <Handle
            type='source'
            position={Position.Right}
            isConnectable={false}
            style={SOCKET_STYLE}
          />
        )}
      </div>
    );
  }

  const openExternalLabel = `Open ${data.label} in new tab`;

  return (
    <div
      title={data.isCycleStub ? CYCLE_STUB_TOOLTIP : undefined}
      className='bg-background relative flex flex-col rounded-xl border shadow-sm'
      style={cardStateStyle(data, selected)}
    >
      <IndicatorLabel data={data} />
      <Handle type='target' position={Position.Left} isConnectable={false} style={SOCKET_STYLE} />

      {/* Header: accent stripe + title + status + actions — mirrors the Models canvas ERD card */}
      <div className='flex items-center gap-2 px-3.5 pt-3 pb-1'>
        <span
          className='h-4 w-1 shrink-0 rounded-sm'
          style={{ background: accent }}
          aria-hidden='true'
        />
        <span
          className='text-foreground flex-1 truncate text-[13px] font-semibold'
          title={data.label}
        >
          {data.label}
        </span>
        <ErdStatusDot isDraft={data.isDraft} decorative />
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
        <ErdDefinitionBadge type={data.definitionType} />
        {data.targetAlias && (
          <Badge
            variant='secondary'
            className='inline-block max-w-[90px] truncate px-1.5 py-0 text-[10px]'
            title={data.targetAlias}
          >
            {data.targetAlias}
          </Badge>
        )}
        <span className='text-muted-foreground ml-auto shrink-0 text-[11px]'>
          {data.fieldCount ?? 0} field{data.fieldCount !== 1 ? 's' : ''}
        </span>
      </div>

      {data.hasOutgoing && (
        <Handle
          type='source'
          position={Position.Right}
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
  const [path] = getBezierPath({
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
}

interface RelationshipFlowGraph {
  nodes: RelationshipFlowNodeType[];
  edges: RelationshipFlowEdgeType[];
  /** Nodes dropped directly by the loop/status filters (their subtrees are dropped on top). */
  filteredOutCount: number;
}

function getRelationshipFlowGraphIdentity(graph: RelationshipFlowGraph): string {
  return JSON.stringify([
    graph.nodes.map(node => [
      node.id,
      node.position.x,
      node.position.y,
      node.width,
      node.height,
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
  onOpenExternal: (targetDmId: string) => void;
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
    info: Omit<NodeInfo, 'dmId'>,
    aliasPath: string
  ): void {
    // Alias paths are unique within the graph, so keying nodes by them keeps
    // ids stable when filters drop earlier nodes (a positional counter would
    // shift every id and remount every node on a filter toggle).
    const nodeKey = `path:${aliasPath}`;
    edgeInfos.push({ sourceId: parentNodeKey, targetId: nodeKey });
    hasOutgoing.add(parentNodeKey);
    nodeInfos.set(nodeKey, { dmId, ...info });
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
        node.aliasPath
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
        rel.targetAlias
      );
    }
  }

  const columns = new Map<number, string[]>();
  const heights = new Map<string, number>();
  for (const [nodeKey, info] of nodeInfos) {
    heights.set(nodeKey, info.isSource ? SRC_H : TGT_H);
    const col = columns.get(info.depth) ?? [];
    if (!columns.has(info.depth)) columns.set(info.depth, col);
    col.push(nodeKey);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const maxDepth = Math.max(...Array.from(columns.keys()));

  for (let d = 0; d <= maxDepth; d++) {
    const col = columns.get(d) ?? [];
    let y = 0;

    for (const nodeKey of col) {
      positions.set(nodeKey, { x: d * (NODE_W + H_GAP), y });
      y += (heights.get(nodeKey) ?? TGT_H) + V_GAP;
    }

    if (d === 0 && col.length === 1) {
      const rootKey = col[0];
      const nextCol = columns.get(1) ?? [];
      const nextH = nextCol.reduce((s, k) => s + (heights.get(k) ?? TGT_H) + V_GAP, -V_GAP);
      const rootH = heights.get(rootKey) ?? SRC_H;
      positions.set(rootKey, { x: 0, y: Math.max(0, nextH / 2 - rootH / 2) });
    }
  }

  const nodes: RelationshipFlowNodeType[] = [];
  for (const [nodeKey, info] of nodeInfos) {
    nodes.push({
      id: nodeKey,
      type: 'relationshipNode',
      position: positions.get(nodeKey) ?? { x: 0, y: 0 },
      width: NODE_W,
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
      data: { warning, dimmed: false },
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
  /**
   * Diagram filters. When provided (the edit page passes them from
   * DataMartRelationshipsContent so the inline and fullscreen instances stay
   * in sync), the canvas is controlled; otherwise it falls back to its own
   * localStorage-backed state.
   */
  showLooped?: boolean;
  onShowLoopedChange?: (checked: boolean) => void;
  statusFilter?: RelationshipStatusFilter;
  onStatusFilterChange?: (next: RelationshipStatusFilter) => void;
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
  showLooped: showLoopedProp,
  onShowLoopedChange,
  statusFilter: statusFilterProp,
  onStatusFilterChange,
}: RelationshipCanvasInnerProps) {
  const reactFlow = useReactFlow<RelationshipFlowNodeType, RelationshipFlowEdgeType>();
  const paneWidth = useStore(s => s.width);
  const paneHeight = useStore(s => s.height);
  const hasFitRef = useRef(false);
  const userInteractedRef = useRef(false);
  const [zoomRange, setZoomRange] = useState<GraphZoomRange>({
    min: GRAPH_ZOOM_MIN,
    max: GRAPH_ZOOM_MAX,
  });
  const [internalShowLooped, setInternalShowLooped] = useState(
    () => storageService.get(SHOW_LOOPED_LS_KEY, 'boolean') ?? false
  );
  const [internalStatusFilter, setInternalStatusFilter] = useState<RelationshipStatusFilter>(() =>
    parseRelationshipStatusFilter(storageService.get(STATUS_FILTER_LS_KEY))
  );
  const showLooped = showLoopedProp ?? internalShowLooped;
  const statusFilter = statusFilterProp ?? internalStatusFilter;

  const handleShowLoopedChange = useCallback(
    (checked: boolean) => {
      if (onShowLoopedChange) {
        onShowLoopedChange(checked);
        return;
      }
      setInternalShowLooped(checked);
      storageService.set(SHOW_LOOPED_LS_KEY, checked);
    },
    [onShowLoopedChange]
  );

  const handleStatusFilterChange = useCallback(
    (next: RelationshipStatusFilter) => {
      if (onStatusFilterChange) {
        onStatusFilterChange(next);
        return;
      }
      setInternalStatusFilter(next);
      storageService.set(STATUS_FILTER_LS_KEY, next);
    },
    [onStatusFilterChange]
  );

  const filtersActive = showLooped || statusFilter !== 'all';

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

  useEffect(() => {
    if (previousGraphIdentityRef.current === graphIdentity) return;
    previousGraphIdentityRef.current = graphIdentity;
    userInteractedRef.current = false;
    // The graph changed (filters, data) — a kept selection could point at a
    // node/edge that no longer exists, so drop the highlight explicitly.
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [graphIdentity]);

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
    return reactFlow
      .fitView({
        minZoom: GRAPH_ZOOM_MIN,
        maxZoom: GRAPH_ZOOM_MAX,
        padding: FIT_VIEW_PADDING,
      })
      .then(() => {
        setZoomRange(getGraphZoomRange(reactFlow.getZoom()));
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
  }, [paneWidth, paneHeight, graphResult, fitFull, zoomToMatches]);

  useEffect(() => {
    if (!hasFitRef.current) return;
    zoomToMatches();
  }, [highlightState, zoomToMatches]);

  const handleZoom = useCallback(
    (delta: number) => {
      markUserInteracted();
      const next = getNextGraphZoom(reactFlow.getZoom(), delta, zoomRange);
      if (!next) return;
      void reactFlow.zoomTo(next.zoom, { duration: 150 });
    },
    [markUserInteracted, reactFlow, zoomRange]
  );

  const handleMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (paneWidth === 0 || paneHeight === 0) return;

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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                className='relative h-12 w-12'
                aria-label={filtersActive ? 'Diagram filters (active)' : 'Diagram filters'}
              >
                <Settings className='h-6 w-6' />
                {filtersActive && (
                  <span
                    className='bg-primary absolute top-1.5 right-1.5 h-2 w-2 rounded-full'
                    aria-hidden='true'
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align='end' side='left' className='w-56'>
              <PopoverTitle>Filters</PopoverTitle>
              <div className='mt-2 flex items-center justify-between gap-2'>
                <label htmlFor='relationship-canvas-show-looped' className='text-sm'>
                  Show looped Data Marts
                </label>
                <Switch
                  id='relationship-canvas-show-looped'
                  checked={showLooped}
                  onCheckedChange={handleShowLoopedChange}
                />
              </div>
              <PopoverTitle className='mt-3 border-t pt-3'>Status</PopoverTitle>
              <div role='radiogroup' aria-label='Status filter' className='mt-2 space-y-0.5'>
                {RELATIONSHIP_STATUS_FILTER_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type='button'
                    role='radio'
                    aria-checked={statusFilter === option.value}
                    className='hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm'
                    onClick={() => {
                      handleStatusFilterChange(option.value);
                    }}
                  >
                    <span>{option.label}</span>
                    {statusFilter === option.value && <Check className='h-4 w-4' />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
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
  onShowLoopedChange,
  statusFilter,
  onStatusFilterChange,
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
          onShowLoopedChange={onShowLoopedChange}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
        />
      </ReactFlowProvider>
    </div>
  );
}
