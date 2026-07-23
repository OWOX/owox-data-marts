import { Check, Locate, Settings, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { Switch } from '@owox/ui/components/switch';
import { Button } from '../../../../shared/components/Button';
import { storageService } from '../../../../services/localstorage.service';
import {
  EDGE_COLOR,
  NODE_PULSE_KEYFRAMES,
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
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import { computeParallelEdgeOffsets } from '../model/graph/parallel-edge-offsets';
import type { PathPoint } from '../model/graph/rounded-path';
import type { ModelCanvasNode } from '../model/types';
import ModelCanvasFlowEdge, { type ModelCanvasFlowEdgeType } from './ModelCanvasFlowEdge';
import ModelCanvasFlowNode, {
  NODE_HEIGHT,
  NODE_WIDTH,
  type ModelCanvasFlowNodeType,
} from './ModelCanvasFlowNode';

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

interface FlowNodeParams {
  node: ModelCanvasNode;
  position: PathPoint;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  highlight: CanvasHighlightState;
  direction: CanvasDirection;
  onOpenExternal: () => void;
  onOpenQuality: () => void;
  onRunQuality: () => Promise<void>;
}

function buildFlowNode(params: FlowNodeParams): ModelCanvasFlowNodeType {
  const { node, highlight } = params;
  return {
    id: node.id,
    type: 'modelCanvasNode',
    position: params.position,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    draggable: false,
    selectable: false,
    focusable: false,
    style: STATIC_NODE_STYLE,
    data: {
      title: node.title,
      isDraft: node.status === DataMartStatus.DRAFT,
      fieldCount: node.fieldCount,
      description: node.description,
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
  route: PathPoint[];
  bowOffset: number;
  warning: boolean;
  dimmed: boolean;
  labelPosition: PathPoint | undefined;
  direction: CanvasDirection;
}

function buildFlowEdge(params: FlowEdgeParams): ModelCanvasFlowEdgeType {
  const { edge, warning } = params;
  const color = warning ? WARNING_COLOR : EDGE_COLOR;
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
      route: params.route,
      bowOffset: params.bowOffset,
      warning,
      joinLabel: params.joinLabel,
      dimmed: params.dimmed,
      labelPosition: params.labelPosition,
      direction: params.direction,
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
  const [showJoinLabels, setShowJoinLabels] = useState(
    () => storageService.get(JOIN_LABELS_LS_KEY, 'boolean') ?? false
  );
  const [ready, setReady] = useState(false);
  const [flowNodes, setFlowNodes] = useState<ModelCanvasFlowNodeType[]>([]);
  const [flowEdges, setFlowEdges] = useState<ModelCanvasFlowEdgeType[]>([]);
  const graphBounds = useMemo(() => getCanvasGraphBounds(flowNodes), [flowNodes]);

  useEffect(() => {
    const hasIncoming = new Set(edges.map(e => e.targetId));
    const hasOutgoing = new Set(edges.map(e => e.sourceId));
    const isDraft = new Map(nodes.map(n => [n.id, n.status === DataMartStatus.DRAFT]));
    const highlightState = computeCanvasHighlight(
      nodes,
      searchQueryRef.current,
      n => n.id,
      n => n.title
    );

    const dagreNodes: DagreLayoutNode[] = nodes.map(n => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));
    const joinLabels = showJoinLabels
      ? new Map(edges.map(e => [e.id, buildJoinLabel(e)]))
      : new Map<string, string[]>();
    const dagreEdges: DagreLayoutEdge[] = edges.map(e => ({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      label: estimateEdgeLabelDimensions(joinLabels.get(e.id) ?? []),
    }));

    const { positions, routes, labelPositions } = runDagreLayout(dagreNodes, dagreEdges, direction);
    const offsets = computeParallelEdgeOffsets(edges);

    setFlowNodes(
      nodes.map(node =>
        buildFlowNode({
          node,
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          hasIncoming: hasIncoming.has(node.id),
          hasOutgoing: hasOutgoing.has(node.id),
          highlight: highlightState.get(node.id) ?? NO_HIGHLIGHT,
          direction,
          onOpenExternal: () => {
            onOpenDataMartRef.current(node.id);
          },
          onOpenQuality: () => {
            onOpenQualityRef.current(node.id);
          },
          onRunQuality: () => onRunQualityRef.current(node.id),
        })
      )
    );

    setFlowEdges(
      edges.map(edge => {
        const dagreRoute = routes.get(edge.id) ?? [];
        const bowOffset = dagreRoute.length === 0 ? (offsets.get(edge.id) ?? 0) : 0;
        const sourceDimmed = highlightState.get(edge.sourceId)?.dimmed ?? false;
        const targetDimmed = highlightState.get(edge.targetId)?.dimmed ?? false;
        return buildFlowEdge({
          edge,
          joinLabel: joinLabels.get(edge.id) ?? [],
          route: dagreRoute,
          bowOffset,
          warning:
            edge.joinNotConfigured ||
            (isDraft.get(edge.sourceId) ?? false) ||
            (isDraft.get(edge.targetId) ?? false),
          dimmed: sourceDimmed && targetDimmed,
          labelPosition: bowOffset === 0 ? labelPositions.get(edge.id) : undefined,
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
  }, [nodes, edges, direction, showJoinLabels, reactFlow]);

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
            <PopoverTitle>Layout algorithm</PopoverTitle>
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
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          minZoom={0.05}
          maxZoom={2}
          onMove={handleMove}
          fitView
          fitViewOptions={{ padding: FIT_VIEW_PADDING }}
          style={{ width: '100%', height: '100%' }}
        >
          <Background variant={BackgroundVariant.Lines} gap={16} color='rgba(0,0,0,0.06)' />
          <MiniMap pannable zoomable style={{ width: 140, height: 100 }} />
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
