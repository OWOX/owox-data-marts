import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import { RelationshipCanvas } from './RelationshipCanvas';

interface ReactFlowStubProps {
  children?: ReactNode;
  minZoom?: number;
  nodes?: {
    id: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    data: {
      isSource: boolean;
      onOpenExternal: () => void;
    };
  }[];
  onMove?: (event: unknown, viewport: ViewportStub) => void;
  onMoveStart?: (event: unknown) => void;
}

interface ViewportStub {
  x: number;
  y: number;
  zoom: number;
}

const reactFlowHarness = vi.hoisted(() => {
  const fitView = vi.fn<(options?: unknown) => Promise<boolean>>();
  const getZoom = vi.fn<() => number>();
  const setViewport = vi.fn<(viewport: ViewportStub) => Promise<boolean>>();
  const zoomTo = vi.fn<(zoom: number, options?: unknown) => Promise<boolean>>();

  return {
    fitView,
    getZoom,
    setViewport,
    zoomTo,
    instance: { fitView, getZoom, setViewport, zoomTo },
    latestProps: null as ReactFlowStubProps | null,
    store: { width: 800, height: 600 },
    scope: vi.fn((path: string) => path),
  };
});

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BackgroundVariant: { Lines: 'lines' },
  Handle: () => null,
  MiniMap: () => null,
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: (props: ReactFlowStubProps) => {
    reactFlowHarness.latestProps = props;
    return <div data-testid='react-flow'>{props.children}</div>;
  },
  ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
  getBezierPath: () => [''],
  useReactFlow: () => reactFlowHarness.instance,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector(reactFlowHarness.store),
}));

vi.mock('../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: reactFlowHarness.scope }),
}));

describe('RelationshipCanvas viewport', () => {
  beforeEach(() => {
    reactFlowHarness.fitView.mockReset().mockResolvedValue(true);
    reactFlowHarness.getZoom.mockReset().mockReturnValue(1.5);
    reactFlowHarness.setViewport.mockReset().mockResolvedValue(true);
    reactFlowHarness.zoomTo.mockReset().mockResolvedValue(true);
    reactFlowHarness.latestProps = null;
    reactFlowHarness.store.width = 800;
    reactFlowHarness.store.height = 600;
    reactFlowHarness.scope.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens relationship targets without exposing the opener or referrer', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(2);
    });
    const targetNode = reactFlowHarness.latestProps?.nodes?.find(node => !node.data.isSource);
    expect(targetNode).toBeDefined();

    targetNode?.data.onOpenExternal();

    expect(openSpy).toHaveBeenCalledWith(
      '/data-marts/target-1/data-setup',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('passes the low zoom floor to a full fit after the interactive floor was raised', async () => {
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.fitView).toHaveBeenCalledTimes(1);
      expect(reactFlowHarness.latestProps?.minZoom).toBe(1.5);
    });
    reactFlowHarness.fitView.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Fit to view' }));

    await waitFor(() => {
      expect(reactFlowHarness.fitView).toHaveBeenCalledWith(
        expect.objectContaining({
          minZoom: 0.05,
          maxZoom: 3,
          padding: 1 / 0.85 - 1,
        })
      );
    });
  });

  it('re-enables automatic fit when graph content changes after a user move', async () => {
    const initialRelationship = buildRelationship('rel-1', 'target-1');
    const { rerender } = render(
      <RelationshipCanvas {...buildCanvasProps([initialRelationship])} />
    );

    await waitFor(() => {
      expect(reactFlowHarness.fitView).toHaveBeenCalledTimes(1);
      expect(reactFlowHarness.latestProps?.minZoom).toBe(1.5);
    });
    reactFlowHarness.latestProps?.onMoveStart?.({ type: 'pointerdown' });

    const semanticallyUnchangedRelationship = {
      ...initialRelationship,
      sourceDataMart: { ...initialRelationship.sourceDataMart },
      targetDataMart: { ...initialRelationship.targetDataMart },
      joinConditions: initialRelationship.joinConditions.map(condition => ({ ...condition })),
    };
    rerender(<RelationshipCanvas {...buildCanvasProps([semanticallyUnchangedRelationship])} />);

    expect(reactFlowHarness.fitView).toHaveBeenCalledTimes(1);

    rerender(
      <RelationshipCanvas
        {...buildCanvasProps([
          semanticallyUnchangedRelationship,
          buildRelationship('rel-2', 'target-2'),
        ])}
      />
    );

    await waitFor(() => {
      expect(reactFlowHarness.fitView).toHaveBeenCalledTimes(2);
    });
  });

  it.each([0.05, 1, 3])(
    'clamps user panning to 150 screen pixels around the graph at zoom %s',
    async zoom => {
      render(
        <RelationshipCanvas
          {...buildCanvasProps([
            buildRelationship('rel-1', 'target-1'),
            buildRelationship('rel-2', 'target-2'),
          ])}
        />
      );

      await waitFor(() => {
        expect(reactFlowHarness.latestProps?.nodes).toHaveLength(3);
      });

      const bounds = getRenderedGraphBounds();
      const onMove = reactFlowHarness.latestProps?.onMove;
      expect(onMove).toBeTypeOf('function');

      onMove?.(new MouseEvent('mousemove'), {
        x: Number.NEGATIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY,
        zoom,
      });
      await waitFor(() => {
        expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
      });
      onMove?.(new MouseEvent('mousemove'), {
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY,
        zoom,
      });
      await waitFor(() => {
        expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(2);
      });

      const lowerViewport = {
        x: 150 - bounds.maxX * zoom,
        y: 150 - bounds.maxY * zoom,
        zoom,
      };
      const upperViewport = {
        x: reactFlowHarness.store.width - 150 - bounds.minX * zoom,
        y: reactFlowHarness.store.height - 150 - bounds.minY * zoom,
        zoom,
      };
      expect(reactFlowHarness.setViewport).toHaveBeenNthCalledWith(1, lowerViewport);
      expect(reactFlowHarness.setViewport).toHaveBeenNthCalledWith(2, upperViewport);
      expect(lowerViewport.x + bounds.maxX * zoom).toBeCloseTo(150);
      expect(lowerViewport.y + bounds.maxY * zoom).toBeCloseTo(150);
      expect(upperViewport.x + bounds.minX * zoom).toBeCloseTo(reactFlowHarness.store.width - 150);
      expect(upperViewport.y + bounds.minY * zoom).toBeCloseTo(reactFlowHarness.store.height - 150);

      if (zoom === 0.05) {
        expect((bounds.maxX - bounds.minX) * zoom).toBeLessThan(reactFlowHarness.store.width - 300);
        expect(lowerViewport.x).toBeLessThan(upperViewport.x);
      }
    }
  );

  it('clamps a programmatic-origin move without recursing on its correction', async () => {
    render(
      <RelationshipCanvas
        {...buildCanvasProps([
          buildRelationship('rel-1', 'target-1'),
          buildRelationship('rel-2', 'target-2'),
        ])}
      />
    );

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(3);
    });

    const outOfBoundsViewport = { x: -10_000, y: 10_000, zoom: 1 };
    reactFlowHarness.setViewport.mockImplementation(async correctedViewport => {
      if (reactFlowHarness.setViewport.mock.calls.length === 1) {
        reactFlowHarness.latestProps?.onMove?.(null, correctedViewport);
      }
      return true;
    });

    reactFlowHarness.latestProps?.onMove?.(null, outOfBoundsViewport);

    expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'MiniMap pointer interaction',
      interact: () => {
        fireEvent.pointerDown(screen.getByTestId('react-flow'));
      },
    },
    {
      name: 'custom zoom control',
      interact: () => {
        fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      },
    },
  ])('preserves the viewport after a $name when the pane resizes', async ({ interact }) => {
    const relationship = buildRelationship('rel-1', 'target-1');
    const { rerender } = render(<RelationshipCanvas {...buildCanvasProps([relationship])} />);

    await waitFor(() => {
      expect(reactFlowHarness.fitView).toHaveBeenCalledTimes(1);
    });
    reactFlowHarness.fitView.mockClear();

    interact();
    reactFlowHarness.store.width = 900;
    rerender(<RelationshipCanvas {...buildCanvasProps([relationship])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps).not.toBeNull();
    });
    expect(reactFlowHarness.fitView).not.toHaveBeenCalled();
  });
});

function getRenderedGraphBounds() {
  const nodes = reactFlowHarness.latestProps?.nodes ?? [];
  return {
    minX: Math.min(...nodes.map(node => node.position.x)),
    minY: Math.min(...nodes.map(node => node.position.y)),
    maxX: Math.max(...nodes.map(node => node.position.x + (node.width ?? 0))),
    maxY: Math.max(...nodes.map(node => node.position.y + (node.height ?? 0))),
  };
}

function buildCanvasProps(relationships: DataMartRelationship[]) {
  return {
    dataMartId: 'source-1',
    dataMartTitle: 'Source',
    dataMartStatus: 'PUBLISHED',
    relationships,
    relationshipGraph: null,
    searchQuery: '',
  };
}

function buildRelationship(id: string, targetId: string): DataMartRelationship {
  return {
    id,
    dataStorageId: 'storage-1',
    sourceDataMart: {
      id: 'source-1',
      title: 'Source',
      status: 'PUBLISHED',
      userHasAccess: true,
    },
    targetDataMart: {
      id: targetId,
      title: `Target ${targetId}`,
      status: 'PUBLISHED',
      userHasAccess: true,
    },
    targetAlias: targetId,
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'source_id' }],
    createdById: 'user-1',
    createdAt: '2026-07-13T00:00:00.000Z',
    modifiedAt: '2026-07-13T00:00:00.000Z',
  };
}
