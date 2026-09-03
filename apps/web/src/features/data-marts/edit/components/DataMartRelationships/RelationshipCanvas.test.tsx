import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTHING_HIDDEN } from '../../../shared/canvas/object-labels';
import type { ErdCardField } from '../../../shared/canvas/erd-fields';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import { RelationshipCanvas } from './RelationshipCanvas';
import { getViewportForBounds } from '@xyflow/react';
import { getGraphZoomRange } from './relationship-canvas-zoom';

const FIT_VIEW_PADDING = 1 / 0.85 - 1;

interface ReactFlowStubProps {
  children?: ReactNode;
  minZoom?: number;
  nodes?: {
    id: string;
    selected?: boolean;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    data: {
      isSource: boolean;
      fields?: { name: string }[];
      onOpenExternal: () => void;
    };
  }[];
  edges?: {
    id: string;
    source: string;
    target: string;
    selected?: boolean;
    data?: { joinLabel?: string[] };
  }[];
  deleteKeyCode?: string | null;
  panActivationKeyCode?: string | null;
  onMove?: (event: unknown, viewport: ViewportStub) => void;
  onMoveStart?: (event: unknown) => void;
  onNodeClick?: (event: unknown, node: { id: string }) => void;
  onPaneClick?: () => void;
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

vi.mock('@xyflow/react', async importOriginal => ({
  // The real padding/zoom math — the zoom-range derivation under test must
  // run against the library's actual getViewportForBounds semantics.
  getViewportForBounds: (await importOriginal<typeof import('@xyflow/react')>())
    .getViewportForBounds,
  useUpdateNodeInternals: () => () => undefined,
  BaseEdge: () => null,
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
    localStorage.clear();
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

  it('keeps every global key shortcut disabled on this embedded canvas', async () => {
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps).not.toBeNull();
    });
    // React Flow's key hooks listen on the whole document and preventDefault their matches, so
    // any non-null key code here steals keystrokes from the rest of the page — the default
    // Space pan shortcut used to eat spaces typed into the SQL editor above this canvas.
    expect(reactFlowHarness.latestProps?.deleteKeyCode).toBeNull();
    expect(reactFlowHarness.latestProps?.panActivationKeyCode).toBeNull();
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

  it('derives the interactive zoom floor from the graph and pane geometry', async () => {
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(2);
    });
    // Expected floor computed with the library's own fitView math, not with
    // the function under test — a formula drift must fail here.
    const bounds = getRenderedGraphBounds();
    const fittedZoom = getViewportForBounds(
      {
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      },
      reactFlowHarness.store.width,
      reactFlowHarness.store.height,
      0.05,
      3,
      FIT_VIEW_PADDING
    ).zoom;
    expect(reactFlowHarness.latestProps?.minZoom).toBe(getGraphZoomRange(fittedZoom).min);
    expect(fittedZoom).toBeGreaterThan(0.05);
  });

  it('fits the whole graph from the layout geometry on first mount', async () => {
    // The regression behind this test: the automatic fit used fitView, which
    // only fits nodes whose DOM dimensions are already measured — on first
    // mount of the Graph tab it ran against a half-measured subset and left
    // the canvas zoomed in on the root card instead of showing the graph.
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });
    const bounds = getRenderedGraphBounds();
    expect(reactFlowHarness.setViewport).toHaveBeenCalledWith(
      getViewportForBounds(
        {
          x: bounds.minX,
          y: bounds.minY,
          width: bounds.maxX - bounds.minX,
          height: bounds.maxY - bounds.minY,
        },
        reactFlowHarness.store.width,
        reactFlowHarness.store.height,
        0.05,
        3,
        FIT_VIEW_PADDING
      )
    );
    expect(reactFlowHarness.fitView).not.toHaveBeenCalled();
  });

  it('passes the low zoom floor to a full fit while the interactive floor is raised', async () => {
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });

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

  it('keeps the zoom buttons working when the initial fit never settles', async () => {
    // The bug behind this test: the zoom range used to be captured only after
    // a completed fit, so a fit that ran under transient conditions (opening
    // the page via search) left both buttons dead until "Fit to view".
    reactFlowHarness.setViewport.mockReset().mockReturnValue(new Promise<boolean>(() => undefined));

    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(reactFlowHarness.zoomTo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(reactFlowHarness.zoomTo).toHaveBeenCalledTimes(2);
  });

  it('recovers with a full fit when the viewport zoom is corrupted', async () => {
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });
    reactFlowHarness.getZoom.mockReturnValue(Number.NaN);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    expect(reactFlowHarness.zoomTo).not.toHaveBeenCalled();
    expect(reactFlowHarness.fitView).toHaveBeenCalledTimes(1);
  });

  it('ignores viewport moves that carry a non-finite zoom', async () => {
    render(
      <RelationshipCanvas
        {...buildCanvasProps([
          buildRelationship('rel-1', 'target-1'),
          buildRelationship('rel-2', 'target-2'),
        ])}
      />
    );

    await waitFor(() => {
      // Let the automatic first fit land, then count only clamp corrections.
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });
    reactFlowHarness.setViewport.mockClear();

    reactFlowHarness.latestProps?.onMove?.(null, { x: -10_000, y: 10_000, zoom: Number.NaN });

    expect(reactFlowHarness.setViewport).not.toHaveBeenCalled();
  });

  it('re-enables automatic fit when graph content changes after a user move', async () => {
    const initialRelationship = buildRelationship('rel-1', 'target-1');
    const { rerender } = render(
      <RelationshipCanvas {...buildCanvasProps([initialRelationship])} />
    );

    await waitFor(() => {
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });
    reactFlowHarness.latestProps?.onMoveStart?.({ type: 'pointerdown' });

    const semanticallyUnchangedRelationship = {
      ...initialRelationship,
      sourceDataMart: { ...initialRelationship.sourceDataMart },
      targetDataMart: { ...initialRelationship.targetDataMart },
      joinConditions: initialRelationship.joinConditions.map(condition => ({ ...condition })),
    };
    rerender(<RelationshipCanvas {...buildCanvasProps([semanticallyUnchangedRelationship])} />);

    expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);

    rerender(
      <RelationshipCanvas
        {...buildCanvasProps([
          semanticallyUnchangedRelationship,
          buildRelationship('rel-2', 'target-2'),
        ])}
      />
    );

    await waitFor(() => {
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(2);
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
        // The automatic first fit also goes through setViewport — let it land
        // and drop it so the counts below cover only the clamp corrections.
        expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
      });
      reactFlowHarness.setViewport.mockClear();

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
      // Let the automatic first fit land, then count only clamp corrections.
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });
    reactFlowHarness.setViewport.mockClear();

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
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });
    reactFlowHarness.setViewport.mockClear();

    interact();
    reactFlowHarness.store.width = 900;
    rerender(<RelationshipCanvas {...buildCanvasProps([relationship])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps).not.toBeNull();
    });
    expect(reactFlowHarness.setViewport).not.toHaveBeenCalled();
    expect(reactFlowHarness.fitView).not.toHaveBeenCalled();
  });
});

describe('RelationshipCanvas filters', () => {
  beforeEach(() => {
    localStorage.clear();
    reactFlowHarness.fitView.mockReset().mockResolvedValue(true);
    reactFlowHarness.getZoom.mockReset().mockReturnValue(1.5);
    reactFlowHarness.setViewport.mockReset().mockResolvedValue(true);
    reactFlowHarness.zoomTo.mockReset().mockResolvedValue(true);
    reactFlowHarness.latestProps = null;
    reactFlowHarness.store.width = 800;
    reactFlowHarness.store.height = 600;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides looped relationships when showLooped is off and shows them when on', async () => {
    const loop = buildRelationship('rel-loop', 'source-1');
    const relationships = [buildRelationship('rel-1', 'target-1'), loop];
    const { rerender } = render(<RelationshipCanvas {...buildCanvasProps(relationships)} />);

    // Root + the ordinary target; the self-referencing loop is filtered out.
    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(2);
    });

    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} showLooped />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(3);
    });
  });

  it('highlights every edge of a clicked data mart and clears on pane click', async () => {
    render(
      <RelationshipCanvas
        {...buildCanvasProps([
          buildRelationship('rel-1', 'target-1'),
          buildRelationship('rel-2', 'target-2'),
        ])}
      />
    );

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.edges).toHaveLength(2);
    });

    const rootId = reactFlowHarness.latestProps?.nodes?.find(node => node.data.isSource)?.id ?? '';
    act(() => {
      reactFlowHarness.latestProps?.onNodeClick?.(null, { id: rootId });
    });

    expect(reactFlowHarness.latestProps?.edges?.map(edge => edge.selected ?? false)).toEqual([
      true,
      true,
    ]);
    expect(reactFlowHarness.latestProps?.nodes?.find(node => node.id === rootId)?.selected).toBe(
      true
    );

    act(() => {
      reactFlowHarness.latestProps?.onPaneClick?.();
    });
    expect(reactFlowHarness.latestProps?.edges?.map(edge => edge.selected ?? false)).toEqual([
      false,
      false,
    ]);
  });

  it('disables React Flow delete handling — the diagram has no delete semantics', async () => {
    render(<RelationshipCanvas {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps).not.toBeNull();
    });
    expect(reactFlowHarness.latestProps?.deleteKeyCode).toBeNull();
  });

  it('filters targets by status', async () => {
    const draft = buildRelationship('rel-draft', 'target-draft');
    draft.targetDataMart.status = 'DRAFT';
    const relationships = [buildRelationship('rel-1', 'target-1'), draft];
    const { rerender } = render(<RelationshipCanvas {...buildCanvasProps(relationships)} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(3);
    });

    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} statusFilter='DRAFT' />);

    // Root + the draft target only.
    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(2);
    });

    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} statusFilter='all' />);
    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(3);
    });
  });
});

describe('RelationshipCanvas view settings', () => {
  beforeEach(() => {
    localStorage.clear();
    reactFlowHarness.fitView.mockReset().mockResolvedValue(true);
    reactFlowHarness.getZoom.mockReset().mockReturnValue(1.5);
    reactFlowHarness.setViewport.mockReset().mockResolvedValue(true);
    reactFlowHarness.zoomTo.mockReset().mockResolvedValue(true);
    reactFlowHarness.latestProps = null;
    reactFlowHarness.store.width = 800;
    reactFlowHarness.store.height = 600;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers the shared canvas settings in the gear popover and delegates changes', async () => {
    const props = buildCanvasProps([buildRelationship('rel-1', 'target-1')]);
    render(<RelationshipCanvas {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));

    fireEvent.click(await screen.findByRole('radio', { name: 'Detailed' }));
    expect(props.onViewModeChange).toHaveBeenCalledWith('erd');

    fireEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    expect(props.onDirectionChange).toHaveBeenCalledWith('vertical');

    fireEvent.click(screen.getByRole('switch', { name: 'Show join fields' }));
    expect(props.onShowJoinFieldsChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('checkbox', { name: /^Status/ }));
    expect(props.onObjectLabelsChange).toHaveBeenCalledWith({
      source: false,
      fields: false,
      status: true,
    });
  });

  it('sizes Detailed cards to their collapsed field rows', async () => {
    render(
      <RelationshipCanvas
        {...buildCanvasProps([buildRelationship('rel-1', 'target-1')])}
        viewMode='erd'
        fieldsByAliasPath={new Map([['target-1', buildFields(6)]])}
      />
    );

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.nodes).toHaveLength(2);
    });
    const target = reactFlowHarness.latestProps?.nodes?.find(node => !node.data.isSource);
    // 92 header + 4 collapsed rows × 26 + the "+2 more" toggle row.
    expect(target?.width).toBe(256);
    expect(target?.height).toBe(92 + 4 * 26 + 26);
    // The rows themselves must reach the card, not just the sizing math.
    expect(target?.data.fields?.map(field => field.name)).toEqual([
      'field_0',
      'field_1',
      'field_2',
      'field_3',
      'field_4',
      'field_5',
    ]);
  });

  it('keeps the selection and viewport across view-settings toggles', async () => {
    const relationships = [buildRelationship('rel-1', 'target-1')];
    const { rerender } = render(<RelationshipCanvas {...buildCanvasProps(relationships)} />);

    await waitFor(() => {
      expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    });

    const rootId = reactFlowHarness.latestProps?.nodes?.find(node => node.data.isSource)?.id ?? '';
    act(() => {
      reactFlowHarness.latestProps?.onNodeClick?.(null, { id: rootId });
    });
    expect(reactFlowHarness.latestProps?.nodes?.find(node => node.id === rootId)?.selected).toBe(
      true
    );

    // Cosmetic toggles relayout the graph but keep every node id — the
    // selection and the user's viewport must survive (no extra fit).
    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} showJoinFields />);
    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} viewMode='erd' />);
    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} direction='vertical' />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps).not.toBeNull();
    });
    expect(reactFlowHarness.setViewport).toHaveBeenCalledTimes(1);
    expect(reactFlowHarness.fitView).not.toHaveBeenCalled();
    expect(reactFlowHarness.latestProps?.nodes?.find(node => node.id === rootId)?.selected).toBe(
      true
    );
  });

  it('labels edges with join conditions when Show join fields is on', async () => {
    const relationships = [buildRelationship('rel-1', 'target-1')];
    const { rerender } = render(<RelationshipCanvas {...buildCanvasProps(relationships)} />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.edges).toHaveLength(1);
    });
    expect(reactFlowHarness.latestProps?.edges?.[0]?.data?.joinLabel).toEqual([]);

    rerender(<RelationshipCanvas {...buildCanvasProps(relationships)} showJoinFields />);

    await waitFor(() => {
      expect(reactFlowHarness.latestProps?.edges?.[0]?.data?.joinLabel).toEqual(['id = source_id']);
    });
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
    showLooped: false,
    statusFilter: 'all' as const,
    viewMode: 'compact' as const,
    onViewModeChange: vi.fn(),
    direction: 'horizontal' as const,
    onDirectionChange: vi.fn(),
    showJoinFields: false,
    onShowJoinFieldsChange: vi.fn(),
    objectLabels: NOTHING_HIDDEN,
    onObjectLabelsChange: vi.fn(),
  };
}

function buildFields(count: number): ErdCardField[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `field_${String(index)}`,
    alias: `field_${String(index)}`,
    type: 'STRING',
    isPrimaryKey: false,
    isHidden: false,
  }));
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
