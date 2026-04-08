import { Badge } from '@owox/ui/components/badge';
import { ExternalLink, Info, Locate, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { GetSchemes } from 'rete';
import { ClassicPreset, NodeEditor } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { type MinimapExtra, MinimapPlugin } from 'rete-minimap-plugin';
import { Presets as ReactPresets, type ReactArea2D, ReactPlugin } from 'rete-react-plugin';
import { Button } from '../../../../../shared/components/Button';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

interface RelationshipCanvasProps {
  dataMartId: string;
  dataMartTitle: string;
  dataMartDescription?: string | null;
  dataMartStatus: string;
  relationships: DataMartRelationship[];
  connectedFieldCounts?: Map<string, number>;
  onRelationshipSelect: (relationship: DataMartRelationship) => void;
  searchQuery: string;
  showTransient: boolean;
  onRequestFullscreen?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const SOCKET = new ClassicPreset.Socket('rel');
const NODE_W = 240;
const SRC_H = 48;
const TGT_H = 74;
const H_GAP = 280;
const V_GAP = 24;
const MAX_DEPTH = 5;
const NODE_BORDER = '#9ca3af'; // gray-400, visible in both themes
const HIGHLIGHT_COLOR = '#3b82f6'; // blue-500
const DRAFT_COLOR = '#f97316'; // orange-500

class DMNode extends ClassicPreset.Node {
  width = NODE_W;
  height = SRC_H;
  isSource: boolean;
  dmId: string;
  depth: number;
  targetAlias?: string;
  joinCount?: number;
  fieldCount?: number;
  description?: string | null;
  onOpenExternal?: () => void;
  isDraft: boolean;
  isBlocked: boolean;
  highlighted = false;
  dimmed = false;

  constructor(
    label: string,
    dmId: string,
    isSource: boolean,
    depth: number,
    opts?: {
      targetAlias?: string;
      joinCount?: number;
      fieldCount?: number;
      description?: string | null;
      onOpenExternal?: () => void;
      isDraft?: boolean;
      isBlocked?: boolean;
    }
  ) {
    super(label);
    this.dmId = dmId;
    this.isSource = isSource;
    this.depth = depth;
    this.targetAlias = opts?.targetAlias;
    this.joinCount = opts?.joinCount;
    this.fieldCount = opts?.fieldCount;
    this.description = opts?.description;
    this.onOpenExternal = opts?.onOpenExternal;
    this.isDraft = opts?.isDraft ?? false;
    this.isBlocked = opts?.isBlocked ?? false;
    if (!isSource) this.height = TGT_H;
  }
}

type Schemes = GetSchemes<DMNode, ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>>;
type AreaExtra = ReactArea2D<Schemes> | MinimapExtra;

const { RefSocket } = ReactPresets.classic;

function NodeComponent(props: { data: Schemes['Node']; emit: (e: ReactArea2D<Schemes>) => void }) {
  const n = props.data;

  function handleExtClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    n.onOpenExternal?.();
  }

  const outputs = Object.entries(n.outputs);
  const inputs = Object.entries(n.inputs);

  if (n.isSource) {
    return (
      <div
        className='text-primary flex items-center'
        style={{
          width: n.width,
          height: n.height,
          borderRadius: 8,
          border: `2px solid ${n.highlighted ? HIGHLIGHT_COLOR : n.isDraft ? DRAFT_COLOR : NODE_BORDER}`,
          boxShadow: n.highlighted
            ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
            : '0 1px 4px 0 rgba(0,0,0,0.12)',
          background: '#eff6ff',
          fontSize: 13,
          fontWeight: 600,
          position: 'relative',
          opacity: n.dimmed ? 0.15 : 1,
          filter: n.dimmed ? 'grayscale(0.8)' : undefined,
          animation: n.highlighted ? 'node-pulse 1.5s ease-in-out infinite' : undefined,
          transition: 'opacity 0.2s, filter 0.2s',
        }}
      >
        {n.isDraft && (
          <span
            style={{
              position: 'absolute',
              top: -18,
              right: 4,
              fontSize: 10,
              fontWeight: 600,
              color: DRAFT_COLOR,
              lineHeight: 1,
            }}
          >
            Draft
          </span>
        )}
        <div className='truncate' style={{ flex: 1, padding: '0 14px' }} title={n.label}>
          {n.label}
        </div>
        {outputs.map(
          ([key, output]) =>
            output && (
              <div key={key} style={{ position: 'absolute', right: -5, top: '50%', marginTop: -5 }}>
                <RefSocket
                  name='output-socket'
                  side='output'
                  socketKey={key}
                  nodeId={n.id}
                  emit={props.emit}
                  payload={output.socket}
                />
              </div>
            )
        )}
      </div>
    );
  }

  const isDeep = n.depth >= 2;
  const isOrange = n.isDraft || n.isBlocked;
  const borderColor = isOrange ? DRAFT_COLOR : NODE_BORDER;

  return (
    <div
      style={{
        width: n.width,
        height: n.height,
        borderRadius: 8,
        border: `${isDeep ? '2px dashed' : '2px solid'} ${n.highlighted ? HIGHLIGHT_COLOR : borderColor}`,
        background: 'var(--background)',
        boxShadow: n.highlighted
          ? `0 0 0 3px ${HIGHLIGHT_COLOR}40, 0 0 12px ${HIGHLIGHT_COLOR}60`
          : isDeep
            ? 'none'
            : '0 1px 4px 0 rgba(0,0,0,0.12)',
        cursor: isDeep ? 'default' : 'pointer',
        position: 'relative',
        opacity: n.dimmed ? 0.15 : 1,
        filter: n.dimmed ? 'grayscale(0.8)' : undefined,
        animation: n.highlighted ? 'node-pulse 1.5s ease-in-out infinite' : undefined,
        transition: 'opacity 0.2s, filter 0.2s',
      }}
    >
      {isOrange && (
        <span
          style={{
            position: 'absolute',
            top: -18,
            right: 4,
            fontSize: 10,
            fontWeight: 600,
            color: DRAFT_COLOR,
            lineHeight: 1,
          }}
        >
          {n.isDraft ? 'Draft' : 'Blocked'}
        </span>
      )}
      {inputs.map(
        ([key, input]) =>
          input && (
            <div
              key={key}
              style={{ position: 'absolute', left: -5, top: '50%', marginTop: -5, zIndex: 1 }}
            >
              <RefSocket
                name='input-socket'
                side='input'
                socketKey={key}
                nodeId={n.id}
                emit={props.emit}
                payload={input.socket}
              />
            </div>
          )
      )}
      <div
        className='bg-muted flex items-center justify-between'
        style={{
          padding: '8px 10px 8px 14px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: '6px 6px 0 0',
        }}
      >
        <span className='truncate' title={n.label}>
          {n.label}
        </span>
        <div className='ml-2 flex shrink-0 items-center gap-0.5'>
          {n.description && (
            <span
              className='text-muted-foreground hover:text-foreground inline-flex cursor-default rounded p-0.5 transition-colors'
              title={n.description}
            >
              <Info style={{ width: 14, height: 14 }} />
            </span>
          )}
          <button
            className='text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-0.5 transition-colors'
            onPointerDown={e => {
              e.stopPropagation();
            }}
            onClick={handleExtClick}
            title='Open in new tab'
            aria-label='Open in new tab'
          >
            <ExternalLink style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
      <div
        className='text-muted-foreground flex items-center gap-2'
        style={{ padding: '6px 14px 8px', fontSize: 11, minWidth: 0 }}
      >
        {n.targetAlias && (
          <Badge
            variant='secondary'
            className='inline-block max-w-[120px] truncate px-1.5 py-0 text-[10px]'
            title={n.targetAlias}
          >
            {n.targetAlias}
          </Badge>
        )}
        <span className='ml-auto shrink-0'>
          {n.joinCount ?? 0} join{n.joinCount !== 1 ? 's' : ''} &middot; {n.fieldCount ?? 0} field
          {n.fieldCount !== 1 ? 's' : ''}
        </span>
      </div>
      {outputs.map(
        ([key, output]) =>
          output && (
            <div
              key={key}
              style={{ position: 'absolute', right: -5, top: '50%', marginTop: -5, zIndex: 1 }}
            >
              <RefSocket
                name='output-socket'
                side='output'
                socketKey={key}
                nodeId={n.id}
                emit={props.emit}
                payload={output.socket}
              />
            </div>
          )
      )}
    </div>
  );
}

function SocketComponent() {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: NODE_BORDER,
        border: '2px solid var(--background)',
      }}
    />
  );
}

interface EditorHandle {
  destroy: () => void;
  fitView: () => Promise<void>;
  zoomBy: (delta: number) => Promise<void>;
  highlightNodes: (query: string) => void;
}

async function setupEditor(
  container: HTMLElement,
  dataMartId: string,
  dataMartTitle: string,
  dataMartDescription: string | null | undefined,
  dataMartStatus: string,
  initialRelationships: DataMartRelationship[],
  fieldCounts: Map<string, number> | undefined,
  onNodeSelect: (targetDmId: string) => void,
  onOpenExternal: (targetDmId: string) => void,
  showTransient: boolean
): Promise<EditorHandle> {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connPlugin = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });
  const minimap = new MinimapPlugin<Schemes>();

  const { useConnection } = ReactPresets.classic;

  function DraftAwareConnection(props: {
    data: Schemes['Connection'] & { isLoop?: boolean };
    styles?: () => unknown;
  }) {
    const { path } = useConnection();
    if (!path) return null;
    const src = editor.getNode(props.data.source);
    const tgt = editor.getNode(props.data.target);
    const orange =
      src?.isDraft === true ||
      src?.isBlocked === true ||
      tgt?.isDraft === true ||
      tgt?.isBlocked === true;
    const bothDimmed =
      (src?.dimmed === true || src === undefined) && (tgt?.dimmed === true || tgt === undefined);

    return (
      <svg
        data-testid='connection'
        style={{
          overflow: 'visible',
          position: 'absolute',
          pointerEvents: 'none',
          width: 9999,
          height: 9999,
        }}
      >
        <path
          d={path}
          fill='none'
          strokeWidth='5px'
          stroke={orange ? DRAFT_COLOR : 'steelblue'}
          strokeDasharray={orange ? '8 4' : undefined}
          opacity={bothDimmed ? 0.15 : 1}
          style={{ pointerEvents: 'auto', transition: 'opacity 0.2s' }}
        />
      </svg>
    );
  }

  render.addPreset(
    ReactPresets.classic.setup({
      customize: {
        node() {
          return NodeComponent;
        },
        socket() {
          return SocketComponent;
        },
        connection() {
          return DraftAwareConnection;
        },
      },
    })
  );
  render.addPreset(ReactPresets.minimap.setup());
  connPlugin.addPreset(ConnectionPresets.classic.setup());

  editor.use(area);
  area.use(connPlugin);
  area.use(render);
  area.use(minimap);

  interface NodeInfo {
    id: string;
    dmId: string;
    title: string;
    description?: string | null;
    depth: number;
    isSource: boolean;
    targetAlias?: string;
    joinCount?: number;
    fieldCount?: number;
    isDraft?: boolean;
    isBlocked?: boolean;
  }
  interface EdgeInfo {
    sourceId: string;
    targetId: string;
  }

  const nodeInfos = new Map<string, NodeInfo>();
  const edges: EdgeInfo[] = [];
  const hasOutgoing = new Set<string>();

  const rootIsDraft = dataMartStatus === 'DRAFT';

  nodeInfos.set(dataMartId, {
    id: dataMartId,
    dmId: dataMartId,
    title: dataMartTitle,
    description: dataMartDescription,
    depth: 0,
    isSource: true,
    isDraft: rootIsDraft,
  });

  let nodeCounter = 0;

  async function collectGraph(
    parentNodeKey: string,
    rels: DataMartRelationship[],
    depth: number,
    ancestorDmIds: Set<string>,
    parentBlocked: boolean
  ) {
    if (rels.length > 0) hasOutgoing.add(parentNodeKey);

    for (const rel of rels) {
      const dmId = rel.targetDataMart.id;
      const nodeKey = `${dmId}-${nodeCounter++}`;
      const isDraft = rel.targetDataMart.status === 'DRAFT';
      const isBlocked = parentBlocked;

      edges.push({ sourceId: parentNodeKey, targetId: nodeKey });

      nodeInfos.set(nodeKey, {
        id: nodeKey,
        dmId,
        title: rel.targetDataMart.title,
        description: rel.targetDataMart.description,
        depth,
        isSource: false,
        targetAlias: rel.targetAlias,
        joinCount: rel.joinConditions.length,
        fieldCount: fieldCounts?.get(rel.id) ?? 0,
        isDraft,
        isBlocked,
      });

      if (showTransient && depth < MAX_DEPTH && !ancestorDmIds.has(dmId)) {
        try {
          const childRels = await dataMartRelationshipService.getRelationships(dmId);
          if (childRels.length > 0) {
            const newAncestors = new Set(ancestorDmIds);
            newAncestors.add(dmId);
            await collectGraph(
              nodeKey,
              childRels,
              depth + 1,
              newAncestors,
              parentBlocked || isDraft
            );
          }
        } catch {
          // skip
        }
      }
    }
  }

  await collectGraph(dataMartId, initialRelationships, 1, new Set([dataMartId]), rootIsDraft);

  const nodeMap = new Map<string, DMNode>();
  const columns = new Map<number, DMNode[]>();

  for (const [nodeKey, info] of nodeInfos) {
    const node = new DMNode(info.title, info.dmId, info.isSource, info.depth, {
      targetAlias: info.targetAlias,
      joinCount: info.joinCount,
      fieldCount: info.fieldCount,
      description: info.description,
      isDraft: info.isDraft,
      isBlocked: info.isBlocked,
      onOpenExternal: () => {
        onOpenExternal(info.dmId);
      },
    });

    if (hasOutgoing.has(nodeKey)) {
      node.addOutput('out', new ClassicPreset.Output(SOCKET));
    }
    if (!info.isSource) {
      node.addInput('in', new ClassicPreset.Input(SOCKET));
    }

    await editor.addNode(node);
    nodeMap.set(nodeKey, node);

    const col = columns.get(info.depth) ?? [];
    if (!columns.has(info.depth)) columns.set(info.depth, col);
    col.push(node);
  }

  for (const edge of edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (src && tgt) {
      await editor.addConnection(
        new ClassicPreset.Connection(
          src as ClassicPreset.Node,
          'out',
          tgt as ClassicPreset.Node,
          'in'
        )
      );
    }
  }

  const maxDepth = Math.max(...Array.from(columns.keys()));

  for (let d = 0; d <= maxDepth; d++) {
    const col = columns.get(d) ?? [];
    let y = 0;

    for (const node of col) {
      await area.translate(node.id, { x: d * (NODE_W + H_GAP), y });
      y += node.height + V_GAP;
    }

    if (d === 0 && col.length === 1) {
      const nextCol = columns.get(1) ?? [];
      const nextH = nextCol.reduce((s, n) => s + n.height + V_GAP, -V_GAP);
      await area.translate(col[0].id, {
        x: 0,
        y: Math.max(0, nextH / 2 - col[0].height / 2),
      });
    }
  }

  const BASE_GRID = 16;
  const updateGrid = () => {
    const { x, y, k } = area.area.transform;
    const size = BASE_GRID * k;
    container.style.backgroundSize = `${size}px ${size}px`;
    container.style.backgroundPosition = `${x}px ${y}px`;
  };

  const fitView = async () => {
    await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: 0.85 });
    updateGrid();
  };
  await fitView();

  const zoomBy = async (delta: number) => {
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    const { k } = area.area.transform;
    const nextK = k * (1 + delta);
    if (nextK < 0.33 || nextK > 3) return;
    await area.area.zoom(nextK, cx * delta, cy * delta);
    updateGrid();
  };

  AreaExtensions.restrictor(area, {
    translation: () => {
      const { k } = area.area.transform;
      const bb = AreaExtensions.getBoundingBox(area, editor.getNodes());
      const rect = container.getBoundingClientRect();
      const pad = 150;
      return {
        left: pad - bb.right * k,
        right: rect.width - pad - bb.left * k,
        top: pad - bb.bottom * k,
        bottom: rect.height - pad - bb.top * k,
      };
    },
  });

  area.addPipe(ctx => {
    if (ctx.type === 'zoom') {
      if (ctx.data.source === 'dblclick') return undefined;
      const nextK = ctx.data.zoom;
      if (nextK < 0.33 || nextK > 3) return undefined;
    }
    if (ctx.type === 'nodetranslate') return undefined;
    if (ctx.type === 'nodepicked') {
      const node = editor.getNode(ctx.data.id);
      if (node?.depth === 1) {
        onNodeSelect(node.dmId);
      }
    }
    if (ctx.type === 'translated' || ctx.type === 'zoomed') {
      updateGrid();
    }
    return ctx;
  });

  const highlightNodes = (query: string) => {
    const q = query.toLowerCase();
    const matching: DMNode[] = [];

    for (const node of editor.getNodes()) {
      const prev = { h: node.highlighted, d: node.dimmed };
      node.highlighted = q !== '' && node.label.toLowerCase().includes(q);
      node.dimmed = q !== '' && !node.highlighted;
      if (node.highlighted) matching.push(node);
      if (prev.h !== node.highlighted || prev.d !== node.dimmed) {
        void area.update('node', node.id);
      }
    }

    // Also update connections so they dim when both endpoints are dimmed
    for (const conn of editor.getConnections()) {
      void area.update('connection', conn.id);
    }

    if (matching.length > 0) {
      void AreaExtensions.zoomAt(area, matching, { scale: 0.85 });
    }
  };

  return {
    destroy: () => {
      area.destroy();
    },
    fitView,
    zoomBy,
    highlightNodes,
  };
}

export function RelationshipCanvas({
  dataMartId,
  dataMartTitle,
  dataMartDescription,
  dataMartStatus,
  relationships,
  connectedFieldCounts,
  onRelationshipSelect,
  searchQuery,
  showTransient,
  onRequestFullscreen,
  className,
  style,
}: RelationshipCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const handleNodeSelect = useCallback(
    (targetId: string) => {
      const rel = relationships.find(r => r.targetDataMart.id === targetId);
      if (rel) onRelationshipSelect(rel);
    },
    [relationships, onRelationshipSelect]
  );

  const handleOpenExternal = useCallback((targetId: string) => {
    const basePath = window.location.pathname.replace(/\/data-marts\/.*/, '');
    window.open(`${basePath}/data-marts/${targetId}/data-setup`, '_blank');
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || relationships.length === 0) return;

    void setupEditor(
      el,
      dataMartId,
      dataMartTitle,
      dataMartDescription,
      dataMartStatus,
      relationships,
      connectedFieldCounts,
      handleNodeSelect,
      handleOpenExternal,
      showTransient
    ).then(h => {
      editorRef.current = h;
      if (searchQueryRef.current) {
        h.highlightNodes(searchQueryRef.current);
      }
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
      el.replaceChildren();
    };
  }, [
    dataMartId,
    dataMartTitle,
    dataMartDescription,
    dataMartStatus,
    relationships,
    connectedFieldCounts,
    handleNodeSelect,
    handleOpenExternal,
    showTransient,
  ]);

  useEffect(() => {
    editorRef.current?.highlightNodes(searchQuery);
  }, [searchQuery]);

  if (relationships.length === 0) return null;

  return (
    <div
      className={`rel-canvas relative overflow-hidden rounded-lg border ${className ?? ''}`}
      style={style ?? { height: 480 }}
    >
      <style>{`
        .rel-canvas svg path { stroke-width: 1.5px !important; }
        .rel-canvas [data-testid="minimap"] { transform: scale(0.5); transform-origin: bottom right; }
        @keyframes node-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25), 0 0 12px rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.15), 0 0 20px rgba(59, 130, 246, 0.5); }
        }
      `}</style>
      <div className='absolute top-3 right-3 z-10 flex items-start gap-2'>
        <div className='flex flex-col gap-1.5'>
          <Button
            variant='outline'
            size='icon'
            className='h-12 w-12'
            onClick={() => {
              void editorRef.current?.fitView();
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
              void editorRef.current?.zoomBy(0.25);
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
              void editorRef.current?.zoomBy(-0.25);
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
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />
    </div>
  );
}
