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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
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
import {
  DIMMED_OPACITY,
  EDGE_COLOR,
  EDGE_STROKE_WIDTH,
  EDGE_WARNING_DASH,
  HIGHLIGHT_COLOR,
  NODE_BORDER_COLOR,
  NODE_PULSE_KEYFRAMES,
  SOCKET_STYLE,
  STATIC_NODE_STYLE,
  WARNING_COLOR,
} from '../../../shared/canvas/constants';
import { computeCanvasHighlight, NO_HIGHLIGHT } from '../../../shared/canvas/highlight';
import { clampCanvasViewport, getCanvasGraphBounds } from '../../../shared/canvas/viewport';
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

interface RelationshipCanvasProps {
  dataMartId: string;
  dataMartTitle: string;
  dataMartDescription?: string | null;
  dataMartStatus: string;
  relationships: DataMartRelationship[];
  relationshipGraph: RelationshipGraph | null;
  connectedFieldCounts?: Map<string, number>;
  searchQuery: string;
  onRequestFullscreen?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const NODE_W = 240;
const SRC_H = 48;
const TGT_H = 74;
const H_GAP = 280;
const V_GAP = 24;
const FIT_VIEW_SCALE = 0.85;
const FIT_VIEW_PADDING = 1 / FIT_VIEW_SCALE - 1;
const GRAPH_ZOOM_MIN = 0.05;
const GRAPH_PAN_PADDING = 150;
// Functional "attention" (e.g. missing PK) — amber, distinct from the non-functional WARNING_COLOR.
const ATTENTION_COLOR = '#f59e0b'; // amber-500

export interface RelationshipNodeData {
  isSource: boolean;
  label: string;
  targetAlias?: string;
  fieldCount?: number;
  description?: string | null;
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

export function RelationshipFlowNode({ data }: NodeProps<RelationshipFlowNodeType>) {
  function handleExtClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    data.onOpenExternal();
  }

  if (data.isSource) {
    return (
      <div
        className='text-primary flex items-center'
        style={{
          width: NODE_W,
          height: SRC_H,
          borderRadius: 8,
          border: `2px solid ${data.highlighted ? HIGHLIGHT_COLOR : data.isDraft ? WARNING_COLOR : NODE_BORDER_COLOR}`,
          boxShadow: data.highlighted
            ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
            : '0 1px 4px 0 rgba(0,0,0,0.12)',
          background: '#eff6ff',
          fontSize: 13,
          fontWeight: 600,
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
        <div className='truncate' style={{ flex: 1, padding: '0 14px' }} title={data.label}>
          {data.label}
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

  const borderColor = hasNodeWarning(data) ? WARNING_COLOR : NODE_BORDER_COLOR;
  const indicator = getRelationshipIndicator(data);
  const openExternalLabel = `Open ${data.label} in new tab`;

  return (
    <div
      title={data.isCycleStub ? CYCLE_STUB_TOOLTIP : undefined}
      style={{
        width: NODE_W,
        height: TGT_H,
        borderRadius: 8,
        border: `2px solid ${data.highlighted ? HIGHLIGHT_COLOR : borderColor}`,
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
      {indicator?.kind === 'warning' && (
        <span
          style={{
            position: 'absolute',
            top: -18,
            right: 4,
            fontSize: 10,
            fontWeight: 600,
            color: WARNING_COLOR,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {indicator.label}
        </span>
      )}
      {indicator?.kind === 'attention' && (
        <span
          title={MISSING_PRIMARY_KEY_TOOLTIP}
          style={{
            position: 'absolute',
            top: -18,
            right: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 10,
            fontWeight: 600,
            color: ATTENTION_COLOR,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <TriangleAlert style={{ width: 12, height: 12 }} />
          {indicator.label}
        </span>
      )}
      <Handle type='target' position={Position.Left} isConnectable={false} style={SOCKET_STYLE} />
      <div
        className='bg-muted flex items-center justify-between'
        style={{
          padding: '8px 10px 8px 14px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: '6px 6px 0 0',
        }}
      >
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='truncate' title={data.label}>
            {data.label}
          </span>
          {!data.userHasAccess && <NoAccessIndicatorNative />}
        </span>
        <div className='ml-2 flex shrink-0 items-center gap-0.5'>
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
        {data.targetAlias && (
          <Badge
            variant='secondary'
            className='inline-block max-w-[120px] truncate px-1.5 py-0 text-[10px]'
            title={data.targetAlias}
          >
            {data.targetAlias}
          </Badge>
        )}
        <span className='ml-auto shrink-0'>
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
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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
  const color = data.warning ? WARNING_COLOR : EDGE_COLOR;

  return (
    <path
      d={path}
      fill='none'
      strokeWidth={EDGE_STROKE_WIDTH}
      stroke={color}
      strokeDasharray={data.warning ? EDGE_WARNING_DASH : undefined}
      opacity={data.dimmed ? DIMMED_OPACITY : 1}
      style={{ transition: 'opacity 0.2s' }}
    />
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

function buildRelationshipFlow(
  dataMartId: string,
  dataMartTitle: string,
  dataMartDescription: string | null | undefined,
  dataMartStatus: string,
  initialRelationships: DataMartRelationship[],
  graph: RelationshipGraph | null,
  fieldCounts: Map<string, number> | undefined,
  onOpenExternal: (targetDmId: string) => void
): RelationshipFlowGraph {
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

  let nodeCounter = 0;
  const aliasPathToNodeKey = new Map<string, string>();
  aliasPathToNodeKey.set('', dataMartId);

  function addEdgeAndNode(
    parentNodeKey: string,
    dmId: string,
    info: Omit<NodeInfo, 'dmId'>,
    aliasPath: string
  ): void {
    const nodeKey = `${dmId}-${nodeCounter++}`;
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

  return { nodes, edges };
}

interface RelationshipCanvasInnerProps {
  dataMartId: string;
  dataMartTitle: string;
  dataMartDescription?: string | null;
  dataMartStatus: string;
  relationships: DataMartRelationship[];
  relationshipGraph: RelationshipGraph | null;
  connectedFieldCounts?: Map<string, number>;
  searchQuery: string;
  onRequestFullscreen?: () => void;
  onOpenExternal: (targetId: string) => void;
}

function RelationshipCanvasInner({
  dataMartId,
  dataMartTitle,
  dataMartDescription,
  dataMartStatus,
  relationships,
  relationshipGraph,
  connectedFieldCounts,
  searchQuery,
  onRequestFullscreen,
  onOpenExternal,
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

  const graphResult = useMemo(
    () =>
      buildRelationshipFlow(
        dataMartId,
        dataMartTitle,
        dataMartDescription,
        dataMartStatus,
        relationships,
        relationshipGraph,
        connectedFieldCounts,
        onOpenExternal
      ),
    [
      dataMartId,
      dataMartTitle,
      dataMartDescription,
      dataMartStatus,
      relationships,
      relationshipGraph,
      connectedFieldCounts,
      onOpenExternal,
    ]
  );

  const graphIdentity = useMemo(() => getRelationshipFlowGraphIdentity(graphResult), [graphResult]);
  const graphBounds = useMemo(() => getCanvasGraphBounds(graphResult.nodes), [graphResult.nodes]);
  const previousGraphIdentityRef = useRef(graphIdentity);

  useEffect(() => {
    if (previousGraphIdentityRef.current === graphIdentity) return;
    previousGraphIdentityRef.current = graphIdentity;
    userInteractedRef.current = false;
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
        return node.data.highlighted === state.highlighted && node.data.dimmed === state.dimmed
          ? node
          : { ...node, data: { ...node.data, ...state } };
      }),
    [graphResult.nodes, highlightState]
  );

  const flowEdges = useMemo(
    () =>
      graphResult.edges.map(edge => {
        const dimmed =
          (highlightState.get(edge.source)?.dimmed ?? false) &&
          (highlightState.get(edge.target)?.dimmed ?? false);
        return edge.data.dimmed === dimmed ? edge : { ...edge, data: { ...edge.data, dimmed } };
      }),
    [graphResult.edges, highlightState]
  );

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
          onMove={handleMove}
          onMoveStart={(event: unknown) => {
            if (event) markUserInteracted();
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Background variant={BackgroundVariant.Lines} gap={16} color='rgba(0,0,0,0.06)' />
          <MiniMap pannable zoomable style={{ width: 140, height: 100 }} />
        </ReactFlow>
      </div>
    </>
  );
}

export function RelationshipCanvas({
  dataMartId,
  dataMartTitle,
  dataMartDescription,
  dataMartStatus,
  relationships,
  relationshipGraph,
  connectedFieldCounts,
  searchQuery,
  onRequestFullscreen,
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
          relationships={relationships}
          relationshipGraph={relationshipGraph}
          connectedFieldCounts={connectedFieldCounts}
          searchQuery={searchQuery}
          onRequestFullscreen={onRequestFullscreen}
          onOpenExternal={handleOpenExternal}
        />
      </ReactFlowProvider>
    </div>
  );
}
