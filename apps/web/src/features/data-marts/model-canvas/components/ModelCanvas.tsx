import { Check, Locate, Settings, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyNodeChanges,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { Switch } from '@owox/ui/components/switch';
import { Button } from '../../../../shared/components/Button';
import { storageService } from '../../../../services/localstorage.service';
import {
  NODE_PULSE_KEYFRAMES,
  OWOX_BLUE,
  STATIC_NODE_STYLE,
  WARNING_COLOR,
} from '../../shared/canvas/constants';
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
import {
  buildPrimaryKeysByNode,
  computeEdgeCardinality,
  type EdgeCardinality,
} from '../model/graph/edge-cardinality';
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import { computeParallelEdgeOffsets } from '../model/graph/parallel-edge-offsets';
import type { PathPoint } from '../model/graph/path-point';
import type { ModelCanvasNode } from '../model/types';
import {
  definitionTypeAccent,
  type CanvasViewMode,
  computeNodeHeight,
  nodeWidth,
} from '../model/erd-node';
import ModelCanvasFlowEdge, { type ModelCanvasFlowEdgeType } from './ModelCanvasFlowEdge';
import ModelCanvasFlowNode, { type ModelCanvasFlowNodeType } from './ModelCanvasFlowNode';

interface ModelCanvasProps {
  nodes: ModelCanvasNode[];
  edges: CanvasRenderEdge[];
  searchQuery: string;
  onOpenDataMart: (dataMartId: string) => void;
  onOpenQuality: (dataMartId: string) => void;
  onRunQuality: (dataMartId: string) => Promise<void>;
  topLeftControls?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const LAYOUT_LS_KEY = 'model-canvas-layout';
const JOIN_LABELS_LS_KEY = 'model-canvas-show-join-fields';
const VIEW_MODE_LS_KEY = 'model-canvas-view-mode';
const VIEW_MODE_OPTIONS: { value: CanvasViewMode; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'erd', label: 'Detailed' },
];
const FIT_VIEW_PADDING = 0.2;
const MARKER_SIZE = 12;
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
  onOpenExternal: () => void;
  onOpenQuality: () => void;
  onRunQuality: () => Promise<void>;
}

function buildFlowNode(params: FlowNodeParams): ModelCanvasFlowNodeType {
  const { node, highlight, viewMode } = params;
  return {
    id: node.id,
    type: 'modelCanvasNode',
    position: params.position,
    width: nodeWidth(viewMode),
    height: computeNodeHeight(node, viewMode),
    draggable: true,
    selectable: false,
    focusable: false,
    style: STATIC_NODE_STYLE,
    data: {
      title: node.title,
      isDraft: node.status === DataMartStatus.DRAFT,
      fieldCount: node.fieldCount,
      description: node.description,
      definitionType: node.definitionType ?? null,
      fields: node.fields ?? [],
      viewMode,
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
  cardinality: EdgeCardinality | null;
}

function buildFlowEdge(params: FlowEdgeParams): ModelCanvasFlowEdgeType {
  const { edge, warning } = params;
  const color = warning ? WARNING_COLOR : OWOX_BLUE;
  const marker = { type: MarkerType.ArrowClosed, color, width: MARKER_SIZE, height: MARKER_SIZE };

  return {
    id: edge.id,
    type: 'modelCanvasEdge',
    source: edge.sourceId,
    target: edge.targetId,
    focusable: false,
    selectable: false,
    markerEnd: marker,
    markerStart: edge.bidirectional ? marker : undefined,
    data: {
      bowOffset: params.bowOffset,
      warning,
      joinLabel: params.joinLabel,
      dimmed: params.dimmed,
      direction: params.direction,
      cardinality: params.cardinality,
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
}

function ModelCanvasInner({
  nodes,
  edges,
  searchQuery,
  onOpenDataMart,
  onOpenQuality,
  onRunQuality,
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

  const [direction, setDirection] = useState<CanvasDirection>(() =>
    parseCanvasDirection(storageService.get(LAYOUT_LS_KEY))
  );
  const [viewMode, setViewMode] = useState<CanvasViewMode>(() =>
    storageService.get(VIEW_MODE_LS_KEY) === 'erd' ? 'erd' : 'compact'
  );
  const [showJoinLabels, setShowJoinLabels] = useState(
    () => storageService.get(JOIN_LABELS_LS_KEY, 'boolean') ?? false
  );
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

    const dagreNodes: DagreLayoutNode[] = topologyNodes.map(n => ({
      id: n.id,
      width: nodeWidth(viewMode),
      height: computeNodeHeight(n, viewMode),
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
    const primaryKeysByNode = buildPrimaryKeysByNode(topologyNodes);
    const liveQualitySummaries = new Map(
      nodesRef.current.map(node => [node.id, node.qualitySummary])
    );

    setFlowNodes(
      topologyNodes.map(topologyNode =>
        buildFlowNode({
          node: {
            ...topologyNode,
            qualitySummary:
              liveQualitySummaries.get(topologyNode.id) ?? topologyNode.qualitySummary,
          },
          position: positions.get(topologyNode.id) ?? { x: 0, y: 0 },
          hasIncoming: hasIncoming.has(topologyNode.id),
          hasOutgoing: hasOutgoing.has(topologyNode.id),
          highlight: highlightState.get(topologyNode.id) ?? NO_HIGHLIGHT,
          direction,
          viewMode,
          onOpenExternal: () => {
            onOpenDataMartRef.current(topologyNode.id);
          },
          onOpenQuality: () => {
            onOpenQualityRef.current(topologyNode.id);
          },
          onRunQuality: () => onRunQualityRef.current(topologyNode.id),
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
          cardinality: computeEdgeCardinality(edge, primaryKeysByNode),
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
  }, [topologyNodes, topologyEdges, direction, viewMode, showJoinLabels, reactFlow]);

  const onNodesChange = useCallback((changes: NodeChange<ModelCanvasFlowNodeType>[]) => {
    setFlowNodes(prev => applyNodeChanges(changes, prev));
  }, []);

  useEffect(() => {
    const summaries = new Map(nodes.map(node => [node.id, node.qualitySummary]));
    setFlowNodes(current =>
      current.map(node => {
        const qualitySummary = summaries.get(node.id);
        return qualitySummary && node.data.qualitySummary !== qualitySummary
          ? { ...node, data: { ...node.data, qualitySummary } }
          : node;
      })
    );
  }, [nodes]);

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
          </PopoverContent>
        </Popover>
      </div>
      {ready && (
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
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
        />
      </ReactFlowProvider>
    </div>
  );
}
