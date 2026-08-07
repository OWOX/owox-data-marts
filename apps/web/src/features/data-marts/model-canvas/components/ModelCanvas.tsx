import { Locate, ZoomIn, ZoomOut } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '../../../../shared/components/Button';
import { CanvasSettingsPopover } from '../../shared/canvas/canvas-settings-panel';
import { storageService } from '../../../../services/localstorage.service';
import { NODE_PULSE_KEYFRAMES, STATIC_NODE_STYLE } from '../../shared/canvas/constants';
import {
  computeCanvasHighlight,
  NO_HIGHLIGHT,
  type CanvasHighlightState,
} from '../../shared/canvas/highlight';
import { clampCanvasViewport, getCanvasGraphBounds } from '../../shared/canvas/viewport';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import { parseCanvasDirection, type CanvasDirection } from '../../shared/canvas/canvas-direction';
import {
  estimateEdgeLabelDimensions,
  runDagreLayout,
  type DagreLayoutEdge,
  type DagreLayoutNode,
} from '../../shared/canvas/dagre-layout';
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import { computeParallelEdgeOffsets } from '../model/graph/parallel-edge-offsets';
import type { PathPoint } from '../../shared/canvas/path-point';
import { definitionTypeAccent } from '../../shared/canvas/definition-type-accent';
import type { ModelCanvasNode } from '../model/types';
import { type CanvasViewMode, computeNodeHeight, nodeWidth } from '../model/erd-node';
import {
  parseObjectLabelsHidden,
  serializeObjectLabelsHidden,
  type ObjectLabelsHidden,
} from '../../shared/canvas/object-labels';
import { parseCanvasViewMode } from '../../shared/canvas/view-mode';
import type { ModelCanvasExportHandle } from '../export';
import ModelCanvasFlowEdge, { type ModelCanvasFlowEdgeType } from './ModelCanvasFlowEdge';
import ModelCanvasFlowNode, { type ModelCanvasFlowNodeType } from './ModelCanvasFlowNode';

interface ModelCanvasProps {
  nodes: ModelCanvasNode[];
  edges: CanvasRenderEdge[];
  searchQuery: string;
  onOpenDataMart: (dataMartId: string) => void;
  onOpenQuality: (dataMartId: string) => void;
  onRunQuality: (dataMartId: string) => Promise<void>;
  /** True while the Actions → Check Data Last Updated sweep is in flight — spins the node icons. */
  isCheckingDataLastUpdated?: boolean;
  /** Scopes the persisted node positions — each storage keeps its own layout. */
  storageId?: string;
  /** Human-readable storage title — names the export files and OKF bundle. */
  storageTitle?: string;
  /** Receives the export API — the Actions menu lives outside the flow provider. */
  exportApiRef?: Ref<ModelCanvasExportHandle>;
  className?: string;
  style?: React.CSSProperties;
}

const LAYOUT_LS_KEY = 'model-canvas-layout';
const JOIN_LABELS_LS_KEY = 'model-canvas-show-join-fields';
const VIEW_MODE_LS_KEY = 'model-canvas-view-mode';
const OBJECT_LABELS_LS_KEY = 'model-canvas-object-labels';
const POSITIONS_LS_KEY_PREFIX = 'model-canvas-positions';

function positionsStorageKey(storageId: string): string {
  return `${POSITIONS_LS_KEY_PREFIX}:${storageId}`;
}

type SavedPositions = Partial<Record<string, PathPoint>>;

function loadSavedPositions(storageId: string | undefined): SavedPositions {
  if (!storageId) return {};
  const raw = storageService.get(positionsStorageKey(storageId), 'json');
  if (!raw) return {};
  const positions: SavedPositions = {};
  for (const [id, value] of Object.entries(raw)) {
    const point = value as Partial<PathPoint> | null;
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      positions[id] = { x: point.x, y: point.y };
    }
  }
  return positions;
}

const FIT_VIEW_PADDING = 0.2;
const CANVAS_PAN_PADDING = 150;

const nodeTypes = { modelCanvasNode: ModelCanvasFlowNode };
const edgeTypes = { modelCanvasEdge: ModelCanvasFlowEdge };

function getNodeTopologySignature(nodes: readonly ModelCanvasNode[]): string {
  return JSON.stringify(
    nodes.map(({ id, title, status, description, fieldCount, definitionType, fields }) => ({
      id,
      title,
      status,
      description,
      fieldCount,
      definitionType,
      fields,
    }))
  );
}

function getEdgeTopologySignature(edges: readonly CanvasRenderEdge[]): string {
  return JSON.stringify(edges);
}

function useStableValue<T>(value: T, getSignature: (value: T) => string): T {
  const signature = getSignature(value);
  const stableRef = useRef({ signature, value });
  if (stableRef.current.signature !== signature) {
    stableRef.current = { signature, value };
  }
  return stableRef.current.value;
}

interface FlowNodeParams {
  node: ModelCanvasNode;
  position: PathPoint;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  highlight: CanvasHighlightState;
  direction: CanvasDirection;
  viewMode: CanvasViewMode;
  objectLabels: ObjectLabelsHidden;
  isCheckingDataLastUpdated: boolean;
  onOpenExternal: () => void;
  onOpenQuality: () => void;
  onRunQuality: () => Promise<void>;
}

function buildFlowNode(params: FlowNodeParams): ModelCanvasFlowNodeType {
  const { node, highlight, viewMode, objectLabels } = params;
  // The field count lives in the status icons row, so the meta row only holds
  // the source badge — hiding the badge drops the whole row.
  const metaRowHidden = objectLabels.source;
  const statusRowHidden = objectLabels.source && objectLabels.fields && objectLabels.status;
  return {
    id: node.id,
    type: 'modelCanvasNode',
    position: params.position,
    width: nodeWidth(viewMode),
    height: computeNodeHeight(node, viewMode, metaRowHidden, statusRowHidden),
    draggable: true,
    selectable: false,
    focusable: false,
    // This canvas has no delete semantics — guard against React Flow's
    // default Backspace handling removing a selected card.
    deletable: false,
    style: STATIC_NODE_STYLE,
    data: {
      title: node.title,
      isDraft: node.status === DataMartStatus.DRAFT,
      fieldCount: node.fieldCount,
      description: node.description,
      definitionType: node.definitionType ?? null,
      fields: node.fields ?? [],
      viewMode,
      objectLabels,
      dataLastUpdated: node.dataLastUpdated,
      isCheckingDataLastUpdated: params.isCheckingDataLastUpdated,
      hasIncoming: params.hasIncoming,
      hasOutgoing: params.hasOutgoing,
      highlighted: highlight.highlighted,
      dimmed: highlight.dimmed,
      direction: params.direction,
      onOpenExternal: params.onOpenExternal,
      qualitySummary: node.qualitySummary,
      onOpenQuality: params.onOpenQuality,
      onRunQuality: params.onRunQuality,
    },
  };
}

function buildJoinLabel(edge: CanvasRenderEdge): string[] {
  return edge.joinConditions.map(c => `${c.sourceFieldName} = ${c.targetFieldName}`);
}

interface FlowEdgeParams {
  edge: CanvasRenderEdge;
  joinLabel: string[];
  bowOffset: number;
  warning: boolean;
  dimmed: boolean;
  direction: CanvasDirection;
}

function buildFlowEdge(params: FlowEdgeParams): ModelCanvasFlowEdgeType {
  const { edge, warning } = params;

  return {
    id: edge.id,
    type: 'modelCanvasEdge',
    source: edge.sourceId,
    target: edge.targetId,
    focusable: false,
    // Clicking an edge selects it; selection is what turns it brand-blue.
    selectable: true,
    deletable: false,
    data: {
      bowOffset: params.bowOffset,
      warning,
      joinLabel: params.joinLabel,
      dimmed: params.dimmed,
      direction: params.direction,
      bidirectional: edge.bidirectional,
    },
  };
}

interface ModelCanvasInnerProps {
  nodes: ModelCanvasNode[];
  edges: CanvasRenderEdge[];
  searchQuery: string;
  onOpenDataMart: (dataMartId: string) => void;
  onOpenQuality: (dataMartId: string) => void;
  onRunQuality: (dataMartId: string) => Promise<void>;
  isCheckingDataLastUpdated?: boolean;
  storageId?: string;
  storageTitle?: string;
  exportApiRef?: Ref<ModelCanvasExportHandle>;
}

function ModelCanvasInner({
  nodes,
  edges,
  searchQuery,
  onOpenDataMart,
  onOpenQuality,
  onRunQuality,
  isCheckingDataLastUpdated = false,
  storageId,
  storageTitle,
  exportApiRef,
}: ModelCanvasInnerProps) {
  const reactFlow = useReactFlow<ModelCanvasFlowNodeType, ModelCanvasFlowEdgeType>();
  const paneWidth = useStore(state => state.width);
  const paneHeight = useStore(state => state.height);
  const flowDomNode = useStore(state => state.domNode);

  const onOpenDataMartRef = useRef(onOpenDataMart);
  onOpenDataMartRef.current = onOpenDataMart;
  const onOpenQualityRef = useRef(onOpenQuality);
  onOpenQualityRef.current = onOpenQuality;
  const onRunQualityRef = useRef(onRunQuality);
  onRunQualityRef.current = onRunQuality;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const isCheckingDataLastUpdatedRef = useRef(isCheckingDataLastUpdated);
  isCheckingDataLastUpdatedRef.current = isCheckingDataLastUpdated;

  const [direction, setDirection] = useState<CanvasDirection>(() =>
    parseCanvasDirection(storageService.get(LAYOUT_LS_KEY))
  );
  const [viewMode, setViewMode] = useState<CanvasViewMode>(() =>
    parseCanvasViewMode(storageService.get(VIEW_MODE_LS_KEY))
  );
  const [showJoinLabels, setShowJoinLabels] = useState(
    () => storageService.get(JOIN_LABELS_LS_KEY, 'boolean') ?? false
  );
  const [objectLabels, setObjectLabels] = useState<ObjectLabelsHidden>(() =>
    parseObjectLabelsHidden(storageService.get(OBJECT_LABELS_LS_KEY))
  );
  // User-dragged positions, mirrored to localStorage per storage so a reload
  // restores the arrangement. Cleared when the user re-runs the layout.
  const savedPositionsRef = useRef<SavedPositions | null>(null);
  const storageIdRef = useRef(storageId);
  if (savedPositionsRef.current === null || storageIdRef.current !== storageId) {
    storageIdRef.current = storageId;
    savedPositionsRef.current = loadSavedPositions(storageId);
  }
  // Bumped when the user re-picks the current layout algorithm: the direction
  // state alone would bail out of React's re-render, silently clearing saved
  // positions without the expected re-flow.
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [ready, setReady] = useState(false);
  const [flowNodes, setFlowNodes] = useState<ModelCanvasFlowNodeType[]>([]);
  const [flowEdges, setFlowEdges] = useState<ModelCanvasFlowEdgeType[]>([]);
  const graphBounds = useMemo(() => getCanvasGraphBounds(flowNodes), [flowNodes]);
  const topologyNodes = useStableValue(nodes, getNodeTopologySignature);
  const topologyEdges = useStableValue(edges, getEdgeTopologySignature);

  // The export deps (html-to-image, fflate) load on first use, so the canvas
  // chunk itself stays lean.
  useImperativeHandle(
    exportApiRef,
    () => ({
      exportCanvas: async format => {
        const { exportModelCanvas } = await import('../export');
        return exportModelCanvas(format, {
          viewport: flowDomNode?.querySelector<HTMLElement>('.react-flow__viewport') ?? null,
          flowNodes,
          nodes,
          edges,
          storageTitle,
        });
      },
    }),
    [flowDomNode, flowNodes, nodes, edges, storageTitle]
  );

  useEffect(() => {
    const hasIncoming = new Set(topologyEdges.map(e => e.targetId));
    const hasOutgoing = new Set(topologyEdges.map(e => e.sourceId));
    const isDraft = new Map(topologyNodes.map(n => [n.id, n.status === DataMartStatus.DRAFT]));
    const highlightState = computeCanvasHighlight(
      topologyNodes,
      searchQueryRef.current,
      n => n.id,
      n => n.title
    );

    const metaRowHidden = objectLabels.source;
    const dagreNodes: DagreLayoutNode[] = topologyNodes.map(n => ({
      id: n.id,
      width: nodeWidth(viewMode),
      height: computeNodeHeight(n, viewMode, metaRowHidden),
    }));
    const joinLabels = showJoinLabels
      ? new Map(topologyEdges.map(e => [e.id, buildJoinLabel(e)]))
      : new Map<string, string[]>();
    const dagreEdges: DagreLayoutEdge[] = topologyEdges.map(e => ({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      label: estimateEdgeLabelDimensions(joinLabels.get(e.id) ?? []),
    }));

    const { positions } = runDagreLayout(dagreNodes, dagreEdges, direction);
    const offsets = computeParallelEdgeOffsets(topologyEdges);

    // Prune saved positions of data marts that no longer exist, so the
    // localStorage entry does not grow forever.
    const knownIds = new Set(topologyNodes.map(n => n.id));
    const allSaved = Object.entries(savedPositionsRef.current ?? {});
    const savedPositions: SavedPositions = Object.fromEntries(
      allSaved.filter(([id]) => knownIds.has(id))
    );
    if (allSaved.length !== Object.keys(savedPositions).length) {
      savedPositionsRef.current = savedPositions;
      if (storageIdRef.current) {
        storageService.set(positionsStorageKey(storageIdRef.current), savedPositions);
      }
    }
    const liveQualitySummaries = new Map(
      nodesRef.current.map(node => [node.id, node.qualitySummary])
    );
    const liveDataLastUpdated = new Map(
      nodesRef.current.map(node => [node.id, node.dataLastUpdated])
    );

    setFlowNodes(
      topologyNodes.map(topologyNode =>
        buildFlowNode({
          node: {
            ...topologyNode,
            qualitySummary:
              liveQualitySummaries.get(topologyNode.id) ?? topologyNode.qualitySummary,
            dataLastUpdated:
              liveDataLastUpdated.get(topologyNode.id) ?? topologyNode.dataLastUpdated,
          },
          // A user-dragged position wins over the computed layout.
          position: savedPositions[topologyNode.id] ??
            positions.get(topologyNode.id) ?? { x: 0, y: 0 },
          hasIncoming: hasIncoming.has(topologyNode.id),
          hasOutgoing: hasOutgoing.has(topologyNode.id),
          highlight: highlightState.get(topologyNode.id) ?? NO_HIGHLIGHT,
          direction,
          viewMode,
          objectLabels,
          onOpenExternal: () => {
            onOpenDataMartRef.current(topologyNode.id);
          },
          onOpenQuality: () => {
            onOpenQualityRef.current(topologyNode.id);
          },
          onRunQuality: () => onRunQualityRef.current(topologyNode.id),
          isCheckingDataLastUpdated: isCheckingDataLastUpdatedRef.current,
        })
      )
    );

    setFlowEdges(
      topologyEdges.map(edge => {
        const sourceDimmed = highlightState.get(edge.sourceId)?.dimmed ?? false;
        const targetDimmed = highlightState.get(edge.targetId)?.dimmed ?? false;
        return buildFlowEdge({
          edge,
          joinLabel: joinLabels.get(edge.id) ?? [],
          bowOffset: offsets.get(edge.id) ?? 0,
          warning:
            edge.joinNotConfigured ||
            (isDraft.get(edge.sourceId) ?? false) ||
            (isDraft.get(edge.targetId) ?? false),
          dimmed: sourceDimmed && targetDimmed,
          direction,
        });
      })
    );

    setReady(true);

    const matchingIds = [...highlightState.entries()]
      .filter(([, state]) => state.highlighted)
      .map(([id]) => id);
    const rafId = requestAnimationFrame(() => {
      void reactFlow.fitView(
        matchingIds.length > 0
          ? {
              nodes: matchingIds.map(id => ({ id })),
              duration: 300,
              padding: FIT_VIEW_PADDING,
            }
          : { padding: FIT_VIEW_PADDING, duration: 300 }
      );
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    topologyNodes,
    topologyEdges,
    direction,
    layoutEpoch,
    viewMode,
    showJoinLabels,
    objectLabels,
    reactFlow,
  ]);

  const onNodesChange = useCallback((changes: NodeChange<ModelCanvasFlowNodeType>[]) => {
    setFlowNodes(prev => applyNodeChanges(changes, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<ModelCanvasFlowEdgeType>[]) => {
    setFlowEdges(prev => applyEdgeChanges(changes, prev));
  }, []);

  // Clicking a data mart highlights every edge connected to it, so all of its
  // relationships are visible at once. Click the card again (or the pane) to clear.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(current => (current === node.id ? null : node.id));
    // Node selection supersedes any single-edge selection.
    setFlowEdges(prev =>
      prev.some(edge => edge.selected)
        ? prev.map(edge => (edge.selected ? { ...edge, selected: false } : edge))
        : prev
    );
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Selecting a single edge supersedes any card selection (and vice versa).
  const handleEdgeClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const displayNodes = useMemo(
    () =>
      selectedNodeId
        ? flowNodes.map(node => (node.id === selectedNodeId ? { ...node, selected: true } : node))
        : flowNodes,
    [flowNodes, selectedNodeId]
  );

  const displayEdges = useMemo(
    () =>
      selectedNodeId
        ? flowEdges.map(edge =>
            edge.source === selectedNodeId || edge.target === selectedNodeId
              ? { ...edge, selected: true }
              : edge
          )
        : flowEdges,
    [flowEdges, selectedNodeId]
  );

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: ModelCanvasFlowNodeType) => {
      const saved = savedPositionsRef.current ?? {};
      saved[node.id] = { x: node.position.x, y: node.position.y };
      savedPositionsRef.current = saved;
      if (storageIdRef.current) {
        storageService.set(positionsStorageKey(storageIdRef.current), saved);
      }
    },
    []
  );

  // Data-only updates (quality polling, a finished Data Last Updated sweep) flow into the
  // existing flow nodes here: the layout effect above deliberately re-runs only when the
  // TOPOLOGY signature changes, so without this sync fresh values would not appear until a
  // reload.
  useEffect(() => {
    const summaries = new Map(nodes.map(node => [node.id, node.qualitySummary]));
    const lastUpdated = new Map(nodes.map(node => [node.id, node.dataLastUpdated]));
    setFlowNodes(current =>
      current.map(node => {
        const qualitySummary = summaries.get(node.id) ?? node.data.qualitySummary;
        const dataLastUpdated = lastUpdated.has(node.id)
          ? (lastUpdated.get(node.id) ?? null)
          : node.data.dataLastUpdated;
        return node.data.qualitySummary !== qualitySummary ||
          node.data.dataLastUpdated !== dataLastUpdated
          ? { ...node, data: { ...node.data, qualitySummary, dataLastUpdated } }
          : node;
      })
    );
  }, [nodes]);

  // The sweep flag is canvas-wide: flip it on every node so the Data Last Updated icons spin
  // while the check runs, mirroring how a RUNNING quality run announces itself.
  useEffect(() => {
    setFlowNodes(current =>
      current.map(node =>
        node.data.isCheckingDataLastUpdated === isCheckingDataLastUpdated
          ? node
          : { ...node, data: { ...node.data, isCheckingDataLastUpdated } }
      )
    );
  }, [isCheckingDataLastUpdated]);

  useEffect(() => {
    const state = computeCanvasHighlight(
      nodesRef.current,
      searchQuery,
      n => n.id,
      n => n.title
    );

    setFlowNodes(prev =>
      prev.map(node => {
        const next = state.get(node.id) ?? NO_HIGHLIGHT;
        return node.data.highlighted === next.highlighted && node.data.dimmed === next.dimmed
          ? node
          : { ...node, data: { ...node.data, ...next } };
      })
    );

    setFlowEdges(prev =>
      prev.map(edge => {
        const sourceDimmed = state.get(edge.source)?.dimmed ?? false;
        const targetDimmed = state.get(edge.target)?.dimmed ?? false;
        const dimmed = sourceDimmed && targetDimmed;
        return edge.data.dimmed === dimmed ? edge : { ...edge, data: { ...edge.data, dimmed } };
      })
    );

    const matchingIds = [...state.entries()].filter(([, s]) => s.highlighted).map(([id]) => id);
    if (matchingIds.length > 0) {
      void reactFlow.fitView({
        nodes: matchingIds.map(id => ({ id })),
        duration: 300,
        padding: FIT_VIEW_PADDING,
      });
    }
  }, [searchQuery, reactFlow]);

  const handleDirectionChange = useCallback((next: CanvasDirection) => {
    setDirection(next);
    storageService.set(LAYOUT_LS_KEY, next);
    // Picking a layout algorithm is an explicit re-layout — drop manual
    // positions, and bump the epoch so re-picking the active algorithm still
    // re-flows instead of silently wiping the saved arrangement.
    savedPositionsRef.current = {};
    if (storageIdRef.current) {
      storageService.remove(positionsStorageKey(storageIdRef.current));
    }
    setLayoutEpoch(epoch => epoch + 1);
  }, []);

  const handleObjectLabelsChange = useCallback((next: ObjectLabelsHidden) => {
    setObjectLabels(current => {
      // No-op picks (e.g. "Check all" when everything is checked) must not
      // re-run the layout effect and throw away the user's pan/zoom.
      if (serializeObjectLabelsHidden(current) === serializeObjectLabelsHidden(next)) {
        return current;
      }
      storageService.set(OBJECT_LABELS_LS_KEY, serializeObjectLabelsHidden(next));
      return next;
    });
  }, []);

  const handleViewModeChange = useCallback((next: CanvasViewMode) => {
    setViewMode(next);
    storageService.set(VIEW_MODE_LS_KEY, next);
  }, []);

  const handleJoinLabelsChange = useCallback((checked: boolean) => {
    setShowJoinLabels(checked);
    storageService.set(JOIN_LABELS_LS_KEY, checked);
  }, []);

  const handleMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (paneWidth === 0 || paneHeight === 0) return;

      const clampedViewport = clampCanvasViewport(
        viewport,
        graphBounds,
        paneWidth,
        paneHeight,
        CANVAS_PAN_PADDING
      );
      if (clampedViewport.x === viewport.x && clampedViewport.y === viewport.y) return;

      void reactFlow.setViewport(clampedViewport);
    },
    [graphBounds, paneHeight, paneWidth, reactFlow]
  );

  return (
    <>
      <div className='absolute top-3 right-3 z-10 flex flex-col gap-1.5'>
        <Button
          variant='outline'
          size='icon'
          className='h-12 w-12'
          onClick={() => {
            void reactFlow.fitView({ padding: FIT_VIEW_PADDING, duration: 300 });
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
            void reactFlow.zoomIn({ duration: 150 });
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
            void reactFlow.zoomOut({ duration: 150 });
          }}
          aria-label='Zoom out'
        >
          <ZoomOut className='h-6 w-6' />
        </Button>
        <CanvasSettingsPopover
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          direction={direction}
          onDirectionChange={handleDirectionChange}
          showJoinFields={showJoinLabels}
          onShowJoinFieldsChange={handleJoinLabelsChange}
          objectLabels={objectLabels}
          onObjectLabelsChange={handleObjectLabelsChange}
        />
      </div>
      {ready && (
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          deleteKeyCode={null}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          edgesFocusable={false}
          minZoom={0.05}
          maxZoom={2}
          onMove={handleMove}
          fitView
          fitViewOptions={{ padding: FIT_VIEW_PADDING }}
          proOptions={{ hideAttribution: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <MiniMap<ModelCanvasFlowNodeType>
            pannable
            zoomable
            style={{ width: 140, height: 100 }}
            nodeColor={node => definitionTypeAccent(node.data.definitionType)}
          />
        </ReactFlow>
      )}
    </>
  );
}

export default function ModelCanvas({
  nodes,
  edges,
  searchQuery,
  onOpenDataMart,
  onOpenQuality,
  onRunQuality,
  isCheckingDataLastUpdated,
  storageId,
  storageTitle,
  exportApiRef,
  className,
  style,
}: ModelCanvasProps) {
  if (nodes.length === 0) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${className ?? ''}`}
      style={style ?? { height: 480 }}
    >
      <style>{NODE_PULSE_KEYFRAMES}</style>
      <ReactFlowProvider>
        <ModelCanvasInner
          nodes={nodes}
          edges={edges}
          searchQuery={searchQuery}
          onOpenDataMart={onOpenDataMart}
          onOpenQuality={onOpenQuality}
          onRunQuality={onRunQuality}
          isCheckingDataLastUpdated={isCheckingDataLastUpdated}
          storageId={storageId}
          storageTitle={storageTitle}
          exportApiRef={exportApiRef}
        />
      </ReactFlowProvider>
    </div>
  );
}
