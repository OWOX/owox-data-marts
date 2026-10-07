import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import ModelCanvas from './ModelCanvas';

interface ViewportStub {
  x: number;
  y: number;
  zoom: number;
}

interface ReactFlowStubProps {
  children?: ReactNode;
  nodes?: {
    id?: string;
    selected?: boolean;
    zIndex?: number;
    deletable?: boolean;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    data?: {
      onOpenQuality?: () => void;
      onRunQuality?: () => Promise<void>;
      qualitySummary?: { state: string };
      dataLastUpdated?: unknown;
      icon?: string | null;
      isCheckingDataLastUpdated?: boolean;
      onRaisedChange?: (raised: boolean) => void;
      onOpenRelationship?: (relationshipId: string, options?: { viaKeyboard?: boolean }) => void;
      relationships?: { joinFields: { otherField: string }[] }[];
    };
  }[];
  edges?: EdgeStub[];
  deleteKeyCode?: string | null;
  onMove?: (event: unknown, viewport: ViewportStub) => void;
  onNodeClick?: (event: unknown, node: { id: string }) => void;
  onEdgeClick?: (event: unknown, edge: EdgeStub) => void;
  onPaneClick?: () => void;
  onMoveStart?: (event: unknown) => void;
}

interface EdgeStub {
  id: string;
  source: string;
  target: string;
  selected?: boolean;
  deletable?: boolean;
  data: { relationshipIds: string[] };
}

const reactFlow = vi.hoisted(() => {
  const stub = {
    fitView: vi.fn().mockResolvedValue(undefined),
    zoomIn: vi.fn().mockResolvedValue(undefined),
    zoomOut: vi.fn().mockResolvedValue(undefined),
    setViewport: vi.fn().mockResolvedValue(undefined),
    setCenter: vi.fn().mockResolvedValue(undefined),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    getNodesBounds: vi.fn<
      (nodes: string[]) => { x: number; y: number; width: number; height: number }
    >(() => ({ x: 0, y: 0, width: 100, height: 50 })),
    getEdges: () => stub.latestProps?.edges ?? [],
    latestProps: null as ReactFlowStubProps | null,
    store: { width: 800, height: 600 },
  };
  return stub;
});

const layout = vi.hoisted(() => ({
  runDagreLayout: vi.fn(
    (
      nodes: { id: string }[]
    ): {
      positions: Map<string, { x: number; y: number }>;
      routes: Map<string, { x: number; y: number }[]>;
      labelPositions: Map<string, { x: number; y: number }>;
    } => ({
      positions: new Map(nodes.map((node, index) => [node.id, { x: index * 300, y: 0 }])),
      routes: new Map(),
      labelPositions: new Map(),
    })
  ),
}));

vi.mock('../../shared/canvas/dagre-layout', () => ({
  runDagreLayout: layout.runDagreLayout,
  estimateEdgeLabelDimensions: () => undefined,
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => () => undefined,
  Background: () => null,
  BackgroundVariant: { Lines: 'lines' },
  Handle: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => null,
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
  ReactFlow: (props: ReactFlowStubProps) => {
    reactFlow.latestProps = props;
    return <div>{props.children}</div>;
  },
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReactFlow: () => reactFlow,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector(reactFlow.store),
}));

describe('ModelCanvas', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    reactFlow.getViewport.mockReturnValue({ x: 0, y: 0, zoom: 1 });
    reactFlow.getNodesBounds.mockReturnValue({ x: 0, y: 0, width: 100, height: 50 });
    reactFlow.latestProps = null;
    reactFlow.store.width = 800;
    reactFlow.store.height = 600;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps active search matches fitted after changing layout direction', async () => {
    render(
      <ModelCanvas
        nodes={[
          {
            id: 'orders',
            title: 'Orders',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 3,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
          {
            id: 'customers',
            title: 'Customers',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 2,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
        ]}
        edges={[]}
        searchQuery='orders'
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalled();
    });
    reactFlow.fitView.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));

    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalled();
    });
    expect(reactFlow.fitView).toHaveBeenLastCalledWith({
      nodes: [{ id: 'orders' }],
      duration: 300,
      padding: 0.2,
    });
  });

  it('clamps MiniMap and programmatic panning to the rendered graph bounds', async () => {
    render(
      <ModelCanvas
        nodes={[
          {
            id: 'orders',
            title: 'Orders',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 3,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
          {
            id: 'customers',
            title: 'Customers',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 2,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
        ]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes).toHaveLength(2);
    });
    const nodes = reactFlow.latestProps?.nodes ?? [];
    const minY = Math.min(...nodes.map(node => node.position.y));
    const maxX = Math.max(...nodes.map(node => node.position.x + (node.width ?? 0)));

    reactFlow.latestProps?.onMove?.(null, { x: -10_000, y: 10_000, zoom: 1 });

    expect(reactFlow.setViewport).toHaveBeenCalledWith({
      x: 150 - maxX,
      y: reactFlow.store.height - 150 - minY,
      zoom: 1,
    });
  });

  it('binds Quality navigation and run actions to the matching Data Mart id', async () => {
    const onOpenQuality = vi.fn();
    const onRunQuality = vi.fn().mockResolvedValue(undefined);
    render(
      <ModelCanvas
        nodes={[
          {
            id: 'orders',
            title: 'Orders',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 3,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
        ]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={onOpenQuality}
        onRunQuality={onRunQuality}
      />
    );

    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes).toHaveLength(1);
    });
    reactFlow.latestProps?.nodes?.[0].data?.onOpenQuality?.();
    await reactFlow.latestProps?.nodes?.[0].data?.onRunQuality?.();

    expect(onOpenQuality).toHaveBeenCalledWith('orders');
    expect(onRunQuality).toHaveBeenCalledWith('orders');
  });

  it('highlights every edge of the clicked data mart and clears on pane click', async () => {
    const edge = (id: string, sourceId: string, targetId: string) => ({
      id,
      relationshipIds: [id],
      sourceId,
      targetId,
      bidirectional: false,
      joinNotConfigured: false,
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
    });
    render(
      <ModelCanvas
        nodes={['orders', 'customers', 'sessions'].map(id => ({
          id,
          title: id,
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 1,
          qualitySummary: buildQualitySummary(),
          dataLastUpdated: null,
        }))}
        edges={[edge('e1', 'orders', 'customers'), edge('e2', 'sessions', 'customers')]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await waitFor(() => {
      expect(reactFlow.latestProps?.edges).toHaveLength(2);
    });

    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'customers' });
    });
    expect(reactFlow.latestProps?.edges?.map(e => e.selected ?? false)).toEqual([true, true]);
    expect(reactFlow.latestProps?.nodes?.find(node => node.id === 'customers')?.selected).toBe(
      true
    );

    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'orders' });
    });
    expect(reactFlow.latestProps?.edges?.map(e => e.selected ?? false)).toEqual([true, false]);

    act(() => {
      reactFlow.latestProps?.onPaneClick?.();
    });
    expect(reactFlow.latestProps?.edges?.map(e => e.selected ?? false)).toEqual([false, false]);

    // A single-edge click supersedes the card selection.
    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'customers' });
    });
    act(() => {
      const clicked = reactFlow.latestProps?.edges?.[0];
      if (clicked) reactFlow.latestProps?.onEdgeClick?.(null, clicked);
    });
    expect(
      reactFlow.latestProps?.nodes?.find(node => node.id === 'customers')?.selected ?? false
    ).toBe(false);

    // The canvas has no delete semantics — Backspace must not remove elements.
    expect(reactFlow.latestProps?.deleteKeyCode).toBeNull();
    expect(reactFlow.latestProps?.nodes?.every(node => node.deletable === false)).toBe(true);
    expect(reactFlow.latestProps?.edges?.every(e => e.deletable === false)).toBe(true);
  });

  it('opens the relationship of a clicked arrow and keeps that arrow highlighted', async () => {
    const onSelectRelationship = vi.fn();
    const nodes = ['orders', 'customers', 'sessions'].map(id => ({
      id,
      title: id,
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 1,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    }));
    const edges = [
      {
        id: 'r1+r2',
        relationshipIds: ['r1', 'r2'],
        sourceId: 'orders',
        targetId: 'customers',
        bidirectional: true,
        joinNotConfigured: false,
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
      {
        id: 'r3',
        relationshipIds: ['r3'],
        sourceId: 'sessions',
        targetId: 'customers',
        bidirectional: false,
        joinNotConfigured: false,
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
    ];
    const renderCanvas = (selectedRelationshipId: string | null) => (
      <ModelCanvas
        nodes={nodes}
        edges={edges}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
        selectedRelationshipId={selectedRelationshipId}
        onSelectRelationship={onSelectRelationship}
      />
    );
    const { rerender } = render(renderCanvas(null));
    await waitFor(() => {
      expect(reactFlow.latestProps?.edges).toHaveLength(2);
    });
    const edgeById = (id: string) => {
      const found = reactFlow.latestProps?.edges?.find(edge => edge.id === id);
      if (!found) throw new Error(`edge ${id} is not rendered`);
      return found;
    };

    // A two-headed arrow opens the relationship drawn from its source.
    act(() => {
      reactFlow.latestProps?.onEdgeClick?.(null, edgeById('r1+r2'));
    });
    expect(onSelectRelationship).toHaveBeenLastCalledWith('r1');

    rerender(renderCanvas('r2'));
    expect(reactFlow.latestProps?.edges?.map(edge => edge.selected ?? false)).toEqual([
      true,
      false,
    ]);

    // Clicking it again keeps the direction the user switched to.
    act(() => {
      reactFlow.latestProps?.onEdgeClick?.(null, edgeById('r1+r2'));
    });
    expect(onSelectRelationship).toHaveBeenLastCalledWith('r2');

    act(() => {
      reactFlow.latestProps?.onEdgeClick?.(null, edgeById('r3'));
    });
    expect(onSelectRelationship).toHaveBeenLastCalledWith('r3');

    act(() => {
      reactFlow.latestProps?.onPaneClick?.();
    });
    expect(onSelectRelationship).toHaveBeenLastCalledWith(null);

    onSelectRelationship.mockClear();
    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'sessions' });
    });
    expect(onSelectRelationship).toHaveBeenCalledWith(null);
  });

  describe('panning a picked arrow into view', () => {
    interface Rect {
      x: number;
      y: number;
      width: number;
      height: number;
    }
    const placeCards = (cards: Record<string, Rect>) => {
      reactFlow.getNodesBounds.mockImplementation((ids: string[]) => {
        const rects = ids.map(id => cards[id]);
        const left = Math.min(...rects.map(rect => rect.x));
        const top = Math.min(...rects.map(rect => rect.y));
        const right = Math.max(...rects.map(rect => rect.x + rect.width));
        const bottom = Math.max(...rects.map(rect => rect.y + rect.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
      });
    };
    const card = (x: number): Rect => ({ x, y: 100, width: 200, height: 100 });
    const renderCanvas = (selectedRelationshipId: string | null) => (
      <ModelCanvas
        nodes={['orders', 'customers'].map(id => ({
          id,
          title: id,
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 1,
          qualitySummary: buildQualitySummary(),
          dataLastUpdated: null,
        }))}
        edges={[
          {
            id: 'r1',
            relationshipIds: ['r1'],
            sourceId: 'orders',
            targetId: 'customers',
            bidirectional: false,
            joinNotConfigured: false,
            joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
          },
        ]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
        selectedRelationshipId={selectedRelationshipId}
        onSelectRelationship={vi.fn()}
      />
    );
    const renderReady = async () => {
      const view = render(renderCanvas(null));
      await waitFor(() => {
        expect(reactFlow.latestProps?.edges).toHaveLength(1);
      });
      return view;
    };

    it('leaves the canvas alone while either card is at least half in view', async () => {
      // The 800 px pane shows the left half of Customers and nothing of Orders.
      placeCards({ orders: card(-900), customers: card(700) });
      const { rerender } = await renderReady();

      rerender(renderCanvas('r1'));

      expect(reactFlow.setCenter).not.toHaveBeenCalled();
    });

    it('does not count a sliver of a card at the edge as in view', async () => {
      // Only the left 20 px of Customers show, so it pans to it: the nearer card.
      placeCards({ orders: card(-3000), customers: card(780) });
      const { rerender } = await renderReady();

      rerender(renderCanvas('r1'));

      expect(reactFlow.setCenter).toHaveBeenCalledWith(880, 150, { zoom: 1, duration: 300 });
    });

    it('pans to both cards, at the same zoom, when they fit together', async () => {
      placeCards({ orders: card(1000), customers: card(1300) });
      reactFlow.getViewport.mockReturnValue({ x: 0, y: 0, zoom: 1 });
      const { rerender } = await renderReady();

      rerender(renderCanvas('r1'));

      expect(reactFlow.setCenter).toHaveBeenCalledWith(1250, 150, { zoom: 1, duration: 300 });
    });

    it('pans to the card nearer the view when the two do not fit together', async () => {
      placeCards({ orders: card(-3000), customers: card(1000) });
      const { rerender } = await renderReady();

      rerender(renderCanvas('r1'));

      expect(reactFlow.setCenter).toHaveBeenCalledWith(1100, 150, { zoom: 1, duration: 300 });
    });

    it('checks again on a resize, unless the user has moved the canvas since the pick', async () => {
      placeCards({ orders: card(1000), customers: card(1300) });
      const { rerender } = await renderReady();
      rerender(renderCanvas('r1'));
      expect(reactFlow.setCenter).toHaveBeenCalledTimes(1);

      // The sheet slides in and the pane narrows: checked again.
      reactFlow.store.width = 700;
      rerender(renderCanvas('r1'));
      expect(reactFlow.setCenter).toHaveBeenCalledTimes(2);

      // The user pans; a later resize leaves their view alone.
      act(() => {
        reactFlow.latestProps?.onMoveStart?.(new MouseEvent('mousedown'));
      });
      reactFlow.store.width = 650;
      rerender(renderCanvas('r1'));
      expect(reactFlow.setCenter).toHaveBeenCalledTimes(2);
    });
  });

  it("opens a relationship picked in a card's list and drops the card selection", async () => {
    const onSelectRelationship = vi.fn();
    render(
      <ModelCanvas
        nodes={['orders', 'customers'].map(id => ({
          id,
          title: id,
          status: DataMartStatus.PUBLISHED,
          description: null,
          fieldCount: 1,
          qualitySummary: buildQualitySummary(),
          dataLastUpdated: null,
        }))}
        edges={[
          {
            id: 'r1',
            relationshipIds: ['r1'],
            sourceId: 'orders',
            targetId: 'customers',
            bidirectional: false,
            joinNotConfigured: false,
            joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
          },
        ]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
        onSelectRelationship={onSelectRelationship}
      />
    );
    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes).toHaveLength(2);
    });
    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'orders' });
    });

    act(() => {
      reactFlow.latestProps?.nodes?.[0].data?.onOpenRelationship?.('r1', { viaKeyboard: true });
    });

    // A keyboard pick says so, so focus can follow into the sheet.
    expect(onSelectRelationship).toHaveBeenLastCalledWith('r1', { viaKeyboard: true });
    expect(reactFlow.latestProps?.nodes?.some(node => node.selected)).toBe(false);
  });

  it('keeps the viewport when only the join fields of a relationship change', async () => {
    const nodes = ['orders', 'customers'].map(id => ({
      id,
      title: id,
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 1,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
      relationshipCount: 1,
      relationships: [
        {
          id: 'r1',
          direction: 'outgoing' as const,
          otherDataMartId: 'customers',
          otherTitle: 'customers',
          joinFields: [{ field: 'customer_id', otherField: 'id' }],
        },
      ],
    }));
    const edge = (targetFieldName: string) => ({
      id: 'r1',
      relationshipIds: ['r1'],
      sourceId: 'orders',
      targetId: 'customers',
      bidirectional: false,
      joinNotConfigured: false,
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName }],
    });
    const renderCanvas = (targetFieldName: string) => (
      <ModelCanvas
        nodes={nodes.map(node => ({
          ...node,
          relationships: node.relationships.map(relationship => ({
            ...relationship,
            joinFields: [{ field: 'customer_id', otherField: targetFieldName }],
          })),
        }))}
        edges={[edge(targetFieldName)]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const { rerender } = render(renderCanvas('id'));
    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalledTimes(1);
    });

    // A save in the relationship sheet refetches the model with the new join fields.
    const positionsBefore = reactFlow.latestProps?.nodes?.map(node => node.position);
    rerender(renderCanvas('customer_key'));
    await waitFor(() => {
      expect(
        reactFlow.latestProps?.nodes?.[0].data?.relationships?.[0].joinFields[0].otherField
      ).toBe('customer_key');
    });
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(reactFlow.fitView).toHaveBeenCalledTimes(1);
    // The cards stay put too: no new layout that could move the arrow being edited.
    expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
    expect(reactFlow.latestProps?.nodes?.map(node => node.position)).toEqual(positionsBefore);
  });

  it('keeps the viewport when a two-headed arrow splits, and refits once other cards connect', async () => {
    const nodes = ['orders', 'customers', 'sessions'].map(id => ({
      id,
      title: id,
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 1,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    }));
    const arrow = (
      id: string,
      relationshipIds: string[],
      sourceId: string,
      targetId: string,
      bidirectional = false
    ) => ({
      id,
      relationshipIds,
      sourceId,
      targetId,
      bidirectional,
      joinNotConfigured: false,
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
    });
    const renderCanvas = (edges: ReturnType<typeof arrow>[]) => (
      <ModelCanvas
        nodes={nodes}
        edges={edges}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const { rerender } = render(
      renderCanvas([arrow('r1+r2', ['r1', 'r2'], 'orders', 'customers', true)])
    );
    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalledTimes(1);
    });

    // A join fields edit broke the mirror: the same two cards, now joined by two arrows.
    rerender(
      renderCanvas([
        arrow('r1', ['r1'], 'orders', 'customers'),
        arrow('r2', ['r2'], 'customers', 'orders'),
      ])
    );
    await waitFor(() => {
      expect(reactFlow.latestProps?.edges).toHaveLength(2);
    });
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(reactFlow.fitView).toHaveBeenCalledTimes(1);
    expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);

    rerender(
      renderCanvas([
        arrow('r1', ['r1'], 'orders', 'customers'),
        arrow('r2', ['r2'], 'customers', 'orders'),
        arrow('r3', ['r3'], 'sessions', 'customers'),
      ])
    );
    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalledTimes(2);
    });
  });

  it('re-flows the layout when the active algorithm is picked again, dropping saved positions', async () => {
    render(
      <ModelCanvas
        nodes={[
          {
            id: 'orders',
            title: 'Orders',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 3,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
        ]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
        storageId='storage-1'
      />
    );

    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
    });

    localStorage.setItem(
      'model-canvas-positions:storage-1',
      JSON.stringify({ orders: { x: 1, y: 2 } })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(2);
    });

    // Re-picking the already-active algorithm still re-flows (and clears
    // positions) instead of silently wiping them with no visible effect.
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(3);
    });
    expect(localStorage.getItem('model-canvas-positions:storage-1')).toBeNull();
  });

  it('updates quality status without rerunning layout or fitting the viewport', async () => {
    const node = {
      id: 'orders',
      title: 'Orders',
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 3,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    };
    const { rerender } = render(
      <ModelCanvas
        nodes={[node]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
      expect(reactFlow.fitView).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ModelCanvas
        nodes={[
          {
            ...node,
            qualitySummary: {
              ...node.qualitySummary,
              state: 'PASSED',
              passedChecks: 1,
              lastRunAt: '2026-07-28T00:00:00.000Z',
            },
          },
        ]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes?.[0].data?.qualitySummary?.state).toBe('PASSED');
    });
    expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
    expect(reactFlow.fitView).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));

    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(2);
    });
    expect(reactFlow.latestProps?.nodes?.[0].data?.qualitySummary?.state).toBe('PASSED');
  });

  it('keeps the zoom when a card label or join fields are toggled, and refits on a new layout', async () => {
    render(
      <ModelCanvas
        nodes={[
          {
            id: 'orders',
            title: 'Orders',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 3,
            qualitySummary: buildQualitySummary(),
            dataLastUpdated: null,
          },
        ]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Triggers/ }));
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(3);
    });
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(reactFlow.fitView).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    await waitFor(() => {
      expect(reactFlow.fitView).toHaveBeenCalledTimes(2);
    });
  });

  it('applies a fresh Data Last Updated value to nodes without rerunning layout', async () => {
    // Regression: the layout effect only reacts to TOPOLOGY changes, so a finished check
    // (which changes node data only) must flow in through the data-sync effect — before this,
    // the sweep's results were invisible until a page reload.
    const node = {
      id: 'orders',
      title: 'Orders',
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 3,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    };
    const commonProps = {
      edges: [],
      searchQuery: '',
      onOpenDataMart: vi.fn(),
      onOpenQuality: vi.fn(),
      onRunQuality: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(<ModelCanvas nodes={[node]} {...commonProps} />);

    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
    });

    const fresh = {
      dataLastUpdatedAt: '2026-07-31T12:22:27.477Z',
      computedAt: '2026-07-31T12:24:00.973Z',
      coverage: 'complete' as const,
      sources: [],
    };
    rerender(<ModelCanvas nodes={[{ ...node, dataLastUpdated: fresh }]} {...commonProps} />);

    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes?.[0].data?.dataLastUpdated).toEqual(fresh);
    });
    expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
  });

  it('shows a newly picked icon on a cached node without rerunning layout', async () => {
    // Regression: the canvas mounts with cached nodes and the refetch only changes the icon,
    // which is not part of the topology signature — it must flow in through the data sync.
    const node = {
      id: 'orders',
      title: 'Orders',
      status: DataMartStatus.PUBLISHED,
      description: null,
      icon: null,
      fieldCount: 3,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    };
    const commonProps = {
      edges: [],
      searchQuery: '',
      onOpenDataMart: vi.fn(),
      onOpenQuality: vi.fn(),
      onRunQuality: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(<ModelCanvas nodes={[node]} {...commonProps} />);

    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
    });

    rerender(<ModelCanvas nodes={[{ ...node, icon: 'orders' as const }]} {...commonProps} />);

    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes?.[0].data?.icon).toBe('orders');
    });
    expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);

    // A later layout run (here: the direction) must not bring the old icon back.
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(2);
    });
    expect(reactFlow.latestProps?.nodes?.[0].data?.icon).toBe('orders');
  });

  it('keeps a lifted card lifted through a layout rebuild and never strands its selection', async () => {
    const node = {
      id: 'orders',
      title: 'Orders',
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 3,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    };
    render(
      <ModelCanvas
        nodes={[node]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(1);
    });
    const orders = () => reactFlow.latestProps?.nodes?.find(n => n.id === 'orders');
    expect(orders()?.zIndex ?? 0).toBe(0);

    // A card whose list opened asks to be lifted…
    act(() => {
      orders()?.data?.onRaisedChange?.(true);
    });
    expect(orders()?.zIndex).toBe(1000);

    // …and stays lifted when a setting rebuilds every node.
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    await waitFor(() => {
      expect(layout.runDagreLayout).toHaveBeenCalledTimes(2);
    });
    expect(orders()?.zIndex).toBe(1000);

    // Selecting and deselecting the lifted card leaves no selection behind.
    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'orders' });
    });
    expect(orders()?.selected).toBe(true);
    act(() => {
      reactFlow.latestProps?.onNodeClick?.(null, { id: 'orders' });
    });
    expect(orders()?.selected ?? false).toBe(false);

    act(() => {
      orders()?.data?.onRaisedChange?.(false);
    });
    expect(orders()?.zIndex ?? 0).toBe(0);
  });

  it('flips the checking flag on every node while the Data Last Updated sweep runs', async () => {
    const node = {
      id: 'orders',
      title: 'Orders',
      status: DataMartStatus.PUBLISHED,
      description: null,
      fieldCount: 3,
      qualitySummary: buildQualitySummary(),
      dataLastUpdated: null,
    };
    const commonProps = {
      edges: [],
      searchQuery: '',
      onOpenDataMart: vi.fn(),
      onOpenQuality: vi.fn(),
      onRunQuality: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(
      <ModelCanvas nodes={[node]} {...commonProps} isCheckingDataLastUpdated={false} />
    );

    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes?.[0].data?.isCheckingDataLastUpdated).toBe(false);
    });

    rerender(<ModelCanvas nodes={[node]} {...commonProps} isCheckingDataLastUpdated />);
    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes?.[0].data?.isCheckingDataLastUpdated).toBe(true);
    });

    rerender(<ModelCanvas nodes={[node]} {...commonProps} isCheckingDataLastUpdated={false} />);
    await waitFor(() => {
      expect(reactFlow.latestProps?.nodes?.[0].data?.isCheckingDataLastUpdated).toBe(false);
    });
  });
});

function buildQualitySummary() {
  return {
    state: 'NEVER_RUN' as const,
    enabledChecks: 1,
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
    dataMartRunId: null,
    lastRunAt: null,
  };
}
