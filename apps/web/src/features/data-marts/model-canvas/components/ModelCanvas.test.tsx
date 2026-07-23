import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    position: { x: number; y: number };
    width?: number;
    height?: number;
    data?: {
      onOpenQuality?: () => void;
      onRunQuality?: () => Promise<void>;
    };
  }[];
  onMove?: (event: unknown, viewport: ViewportStub) => void;
}

const reactFlow = vi.hoisted(() => ({
  fitView: vi.fn().mockResolvedValue(undefined),
  zoomIn: vi.fn().mockResolvedValue(undefined),
  zoomOut: vi.fn().mockResolvedValue(undefined),
  setViewport: vi.fn().mockResolvedValue(undefined),
  latestProps: null as ReactFlowStubProps | null,
  store: { width: 800, height: 600 },
}));

vi.mock('@xyflow/react', () => ({
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
          },
          {
            id: 'customers',
            title: 'Customers',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 2,
            qualitySummary: buildQualitySummary(),
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
          },
          {
            id: 'customers',
            title: 'Customers',
            status: DataMartStatus.PUBLISHED,
            description: null,
            fieldCount: 2,
            qualitySummary: buildQualitySummary(),
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

  it('renders supplied controls in the top-left canvas overlay', () => {
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
          },
        ]}
        edges={[]}
        searchQuery=''
        onOpenDataMart={vi.fn()}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
        topLeftControls={<button type='button'>Actions 1</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Actions 1' })).toBeVisible();
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
