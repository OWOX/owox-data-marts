import { Check, Locate, Settings, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { Switch } from '@owox/ui/components/switch';
import { Button } from '../../../../shared/components/Button';
import { storageService } from '../../../../services/localstorage.service';
import { NODE_PULSE_KEYFRAMES, STATIC_NODE_STYLE } from '../../shared/canvas/constants';
import {
  computeCanvasHighlight,
  NO_HIGHLIGHT,
  type CanvasHighlightState,
} from '../../shared/canvas/highlight';
import { clampCanvasViewport, getCanvasGraphBounds } from '../../shared/canvas/viewport';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import {
  CANVAS_DIRECTION_OPTIONS,
  parseCanvasDirection,
  type CanvasDirection,
} from '../model/graph/canvas-direction';
import {
  runDagreLayout,
  type DagreLayoutEdge,
  type DagreLayoutNode,
} from '../model/graph/dagre-layout';
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import { computeParallelEdgeOffsets } from '../model/graph/parallel-edge-offsets';
import type { PathPoint } from '../model/graph/path-point';
import { definitionTypeAccent } from '../../shared/canvas/definition-type-accent';
import type { ModelCanvasNode } from '../model/types';
import { type CanvasViewMode, computeNodeHeight, nodeWidth } from '../model/erd-node';
import {
  ALL_HIDDEN,
  isAllHidden,
  isNothingHidden,
  NOTHING_HIDDEN,
  OBJECT_LABEL_PARTS,
  parseObjectLabelsHidden,
  serializeObjectLabelsHidden,
  toggleObjectLabelPart,
  type ObjectLabelPart,
  type ObjectLabelsHidden,
} from '../model/object-labels';
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
  topLeftControls?: ReactNode;
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

const OBJECT_LABEL_META: Record<ObjectLabelPart, { glyph: string; label: string; helper: string }> =
  {
    source: {
      glyph: '⬚',
      label: 'Input source',
      helper: 'The source badge (VIEW / TABLE / SQL / CONNECTOR) and its accent stripe',
    },
    fields: {
      glyph: '#',
      label: 'Field count',
      helper: 'The field-count line under each object',
    },
    status: {
      glyph: '•',
      label: 'Status dot',
      helper: 'The published/draft status dot in the card header',
    },
  };
const VIEW_MODE_OPTIONS: { value: CanvasViewMode; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'erd', label: 'Detailed' },
];
const FIT_VIEW_PADDING = 0.2;
const LABEL_CHAR_WIDTH = 6.6;
const LABEL_HORIZONTAL_PADDING = 18;
const LABEL_LINE_HEIGHT = 16.5;
const LABEL_VERTICAL_PADDING = 8;
const CANVAS_PAN_PADDING = 150;

function estimateEdgeLabelDimensions(
  joinLabel: string[]
): { width: number; height: number } | undefined {
  if (joinLabel.length === 0) return undefined;
  const maxLineChars = Math.max(...joinLabel.map(line => line.length));
  return {
    width: maxLineChars * LABEL_CHAR_WIDTH + LABEL_HORIZONTAL_PADDING,
    height: joinLabel.length * LABEL_LINE_HEIGHT + LABEL_VERTICAL_PADDING,
  };
}

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
  const metaRowHidden = objectLabels.source && objectLabels.fields;
  const statusRowHidden = metaRowHidden && objectLabels.status;
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
}: ModelCanvasInnerProps) {
  const reactFlow = useReactFlow<ModelCanvasFlowNodeType, ModelCanvasFlowEdgeType>();
  const paneWidth = useStore(state => state.width);
  const paneHeight = useStore(state => state.height);

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
    storageService.get(VIEW_MODE_LS_KEY) === 'erd' ? 'erd' : 'compact'
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

    const metaRowHidden = objectLabels.source && objectLabels.fields;
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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              className='h-12 w-12'
              aria-label='Canvas settings'
            >
              <Settings className='h-6 w-6' />
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' side='left' className='w-56'>
            <PopoverTitle>View</PopoverTitle>
            <div
              role='radiogroup'
              aria-label='Card view mode'
              className='bg-muted mt-2 grid grid-cols-2 gap-0.5 rounded-md p-0.5'
            >
              {VIEW_MODE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type='button'
                  role='radio'
                  aria-checked={viewMode === option.value}
                  className={`rounded px-2 py-1 text-sm transition-colors ${
                    viewMode === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    handleViewModeChange(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <PopoverTitle className='mt-3 border-t pt-3'>Layout algorithm</PopoverTitle>
            <div role='radiogroup' aria-label='Layout algorithm' className='mt-2 space-y-0.5'>
              {CANVAS_DIRECTION_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type='button'
                  role='radio'
                  aria-checked={direction === option.value}
                  className='hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm'
                  onClick={() => {
                    handleDirectionChange(option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {direction === option.value && <Check className='h-4 w-4' />}
                </button>
              ))}
            </div>
            <div className='mt-3 flex items-center justify-between gap-2 border-t pt-3'>
              <label htmlFor='model-canvas-show-join-fields' className='text-sm'>
                Show join fields
              </label>
              <Switch
                id='model-canvas-show-join-fields'
                checked={showJoinLabels}
                onCheckedChange={handleJoinLabelsChange}
              />
            </div>
            <PopoverTitle className='mt-3 border-t pt-3'>Object labels</PopoverTitle>
            <p className='text-muted-foreground mt-1 text-xs leading-snug'>
              Tick what every object shows — untick to hide it.
            </p>
            <div className='mt-2 space-y-0.5'>
              {/* A checked box means the part is VISIBLE — unchecking hides it.
                  The stored state is the hidden set, hence the inversion here. */}
              {OBJECT_LABEL_PARTS.map(part => {
                const meta = OBJECT_LABEL_META[part];
                const shown = !objectLabels[part];
                return (
                  <button
                    key={part}
                    type='button'
                    role='checkbox'
                    aria-checked={shown}
                    className='hover:bg-muted flex w-full items-start gap-2 rounded px-2 py-1.5 text-left'
                    onClick={() => {
                      handleObjectLabelsChange(toggleObjectLabelPart(objectLabels, part));
                    }}
                  >
                    <span
                      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                        shown
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-transparent'
                      }`}
                      aria-hidden='true'
                    >
                      <Check className='h-2.5 w-2.5' strokeWidth={3.5} />
                    </span>
                    <span className='flex min-w-0 flex-col'>
                      <span
                        className={`text-sm font-medium ${shown ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        <span className='text-muted-foreground mr-1 font-bold'>{meta.glyph}</span>
                        {meta.label}
                      </span>
                      <span className='text-muted-foreground text-xs leading-snug'>
                        {meta.helper}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Both-ends shortcuts: tick everything back on, or clear it all. */}
            <div className='mt-1 space-y-0.5 border-t pt-1'>
              <button
                type='button'
                aria-pressed={isNothingHidden(objectLabels)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium ${
                  isNothingHidden(objectLabels)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
                onClick={() => {
                  handleObjectLabelsChange(NOTHING_HIDDEN);
                }}
              >
                <span className='w-4 shrink-0 text-center font-bold' aria-hidden='true'>
                  ≡
                </span>
                Check all — show everything
              </button>
              <button
                type='button'
                aria-pressed={isAllHidden(objectLabels)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium ${
                  isAllHidden(objectLabels)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
                onClick={() => {
                  handleObjectLabelsChange(ALL_HIDDEN);
                }}
              >
                <span className='w-4 shrink-0 text-center font-bold' aria-hidden='true'>
                  ⊘
                </span>
                Uncheck all — title only
              </button>
            </div>
          </PopoverContent>
        </Popover>
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
  topLeftControls,
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
      {topLeftControls && <div className='absolute top-3 left-3 z-10'>{topLeftControls}</div>}
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
        />
      </ReactFlowProvider>
    </div>
  );
}
