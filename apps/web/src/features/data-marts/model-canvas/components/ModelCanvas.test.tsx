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
    deletable?: boolean;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    data?: {
      onOpenQuality?: () => void;
      onRunQuality?: () => Promise<void>;
      qualitySummary?: { state: string };
      dataLastUpdated?: unknown;
      isCheckingDataLastUpdated?: boolean;
    };
  }[];
  edges?: {
    id: string;
    source: string;
    target: string;
    selected?: boolean;
    deletable?: boolean;
  }[];
  deleteKeyCode?: string | null;
  onMove?: (event: unknown, viewport: ViewportStub) => void;
  onNodeClick?: (event: unknown, node: { id: string }) => void;
  onEdgeClick?: () => void;
  onPaneClick?: () => void;
}

const reactFlow = vi.hoisted(() => ({
  fitView: vi.fn().mockResolvedValue(undefined),
  zoomIn: vi.fn().mockResolvedValue(undefined),
  zoomOut: vi.fn().mockResolvedValue(undefined),
  setViewport: vi.fn().mockResolvedValue(undefined),
  latestProps: null as ReactFlowStubProps | null,
  store: { width: 800, height: 600 },
}));

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
      reactFlow.latestProps?.onEdgeClick?.();
    });
    expect(
      reactFlow.latestProps?.nodes?.find(node => node.id === 'customers')?.selected ?? false
    ).toBe(false);

    // The canvas has no delete semantics — Backspace must not remove elements.
    expect(reactFlow.latestProps?.deleteKeyCode).toBeNull();
    expect(reactFlow.latestProps?.nodes?.every(node => node.deletable === false)).toBe(true);
    expect(reactFlow.latestProps?.edges?.every(e => e.deletable === false)).toBe(true);
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
