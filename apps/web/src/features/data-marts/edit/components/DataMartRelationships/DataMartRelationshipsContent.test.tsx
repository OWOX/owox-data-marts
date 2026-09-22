import type { ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailableSource,
  BlendableSchema,
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';
import type { SourceEntry } from './RelationshipAccordionItem';
import { DataMartRelationshipsContent } from './DataMartRelationshipsContent';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';

interface CanvasStubProps {
  showLooped: boolean;
  statusFilter: string;
  viewMode: string;
  direction: string;
  showJoinFields: boolean;
  onViewModeChange: (next: string) => void;
  onRequestFullscreen?: () => void;
}

interface AccordionStubProps {
  row: { relationship: DataMartRelationship; rowKey: string };
  onRelationshipUpdated: (updated: DataMartRelationship) => void;
  onRelationshipDescriptionSaved: (updated: DataMartRelationship) => void;
  onDescriptionOverrideChange: (source: SourceEntry, description: string) => void;
}

const harness = vi.hoisted(() => {
  function buildRelationship(
    id: string,
    targetId: string,
    targetTitle: string,
    status: string
  ): DataMartRelationship {
    return {
      id,
      dataStorageId: 'storage-1',
      sourceDataMart: { id: 'dm-1', title: 'Root', status: 'PUBLISHED', userHasAccess: true },
      targetDataMart: { id: targetId, title: targetTitle, status, userHasAccess: true },
      targetAlias: targetId,
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'root_id' }],
      createdById: 'user-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      modifiedAt: '2026-08-01T00:00:00.000Z',
    };
  }

  const graph: RelationshipGraph = {
    rootDataMartId: 'dm-1',
    nodes: [
      {
        relationship: buildRelationship('rel-alpha', 'dm-alpha', 'Alpha', 'PUBLISHED'),
        aliasPath: 'alpha',
        depth: 1,
        isCycleStub: false,
        isBlocked: false,
      },
      {
        relationship: buildRelationship('rel-beta', 'dm-beta', 'Beta', 'DRAFT'),
        aliasPath: 'beta',
        depth: 1,
        isCycleStub: false,
        isBlocked: false,
      },
      {
        relationship: buildRelationship('rel-loop', 'dm-1', 'Root', 'PUBLISHED'),
        aliasPath: 'alpha.root',
        depth: 2,
        isCycleStub: true,
        isBlocked: false,
      },
    ],
  };

  const schema: BlendableSchema = {
    nativeFields: [],
    blendedFields: [],
    availableSources: [],
  };

  return {
    graph,
    schema,
    canvasProps: { current: null as CanvasStubProps | null },
    accordionProps: { current: null as AccordionStubProps | null },
    accordionPropsByRowKey: new Map<string, AccordionStubProps>(),
    syncDataMartFromResponse: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../../model/context/useDataMartContext', () => {
  // One stable context value: a fresh dataMart per render would retrigger the
  // component's blendedFieldsConfig-sync effect forever.
  const context = {
    dataMart: {
      id: 'dm-1',
      title: 'Root',
      description: null,
      status: { code: 'PUBLISHED' },
      definitionType: null,
      storage: { id: 'storage-1' },
      blendedFieldsConfig: { sources: [] },
    },
    syncDataMartFromResponse: harness.syncDataMartFromResponse,
    refreshDataMart: vi.fn(),
  };
  return { useDataMartContext: () => context };
});

vi.mock('react-hot-toast', () => ({
  default: harness.toast,
  toast: harness.toast,
}));

vi.mock('../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    getRelationshipGraph: vi.fn(() => Promise.resolve(harness.graph)),
    getBlendableSchema: vi.fn(() => Promise.resolve(harness.schema)),
    updateBlendedFieldsConfig: vi.fn(),
    deleteRelationship: vi.fn(),
  },
}));

vi.mock('./useRelationshipDefinitionTypes', () => ({
  useRelationshipDefinitionTypes: () => new Map<string, null>(),
}));

vi.mock('./RelationshipAccordionItem', () => ({
  RelationshipAccordionItem: (props: AccordionStubProps) => {
    harness.accordionProps.current = props;
    harness.accordionPropsByRowKey.set(props.row.rowKey, props);
    return (
      <>
        <div data-testid='relationship-row'>{props.row.relationship.targetDataMart.title}</div>
        <div data-testid={`relationship-description-${props.row.rowKey}`}>
          {props.row.relationship.description ?? ''}
        </div>
      </>
    );
  },
}));

vi.mock('./RelationshipCanvas', () => ({
  RelationshipCanvas: (props: CanvasStubProps) => {
    harness.canvasProps.current = props;
    return <div data-testid='relationship-canvas' />;
  },
}));

// Radix Select needs pointer-capture and ResizeObserver APIs jsdom lacks; the
// container's contract (value in, onValueChange out) is what matters here, so
// the design-system Select is replaced with a native <select>.
vi.mock('@owox/ui/components/select', () => {
  const triggerLabel = (children: ReactNode): string | undefined => {
    let label: string | undefined;
    Children.forEach(children, child => {
      if (isValidElement(child)) {
        const ariaLabel = (child.props as Record<string, unknown>)['aria-label'];
        if (typeof ariaLabel === 'string') label ??= ariaLabel;
      }
    });
    return label;
  };
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children?: ReactNode;
    }) => (
      <select
        aria-label={triggerLabel(children)}
        value={value}
        onChange={event => {
          onValueChange(event.target.value);
        }}
      >
        {children}
      </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

function renderContent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <DataMartRelationshipsContent />
      </QueryClientProvider>
    ),
    queryClient,
  };
}

const rowTitles = () => screen.getAllByTestId('relationship-row').map(row => row.textContent);

describe('DataMartRelationshipsContent toolbar filters', () => {
  beforeEach(() => {
    localStorage.clear();
    harness.canvasProps.current = null;
  });

  it('seeds stored filters, applies changes to the list and persists them per mart', async () => {
    localStorage.setItem('relationship-canvas-status-filter:dm-1', 'DRAFT');

    renderContent();

    // The seeded per-mart preference filters the list on first render.
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Beta']);
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'all' },
    });

    // Looped stubs stay hidden by default even with the status filter open.
    expect(rowTitles()).toEqual(['Alpha', 'Beta']);
    expect(localStorage.getItem('relationship-canvas-status-filter:dm-1')).toBe('all');

    fireEvent.change(screen.getByRole('combobox', { name: 'Looped data marts' }), {
      target: { value: 'show' },
    });

    expect(rowTitles()).toEqual(['Alpha', 'Beta', 'Root']);
    expect(localStorage.getItem('relationship-canvas-show-looped:dm-1')).toBe('true');
  });

  it('passes the toolbar filters to the diagram so both views stay in sync', async () => {
    localStorage.setItem('relationship-canvas-status-filter:dm-1', 'DRAFT');

    renderContent();

    await waitFor(() => {
      expect(rowTitles()).toEqual(['Beta']);
    });

    // Radix Tabs activates on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Graph/ }), { button: 0 });

    await screen.findByTestId('relationship-canvas');
    expect(harness.canvasProps.current).toMatchObject({
      showLooped: false,
      statusFilter: 'DRAFT',
      viewMode: 'compact',
      direction: 'horizontal',
      showJoinFields: false,
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Looped data marts' }), {
      target: { value: 'show' },
    });
    expect(harness.canvasProps.current).toMatchObject({ showLooped: true });
  });

  it('keeps the fullscreen canvas in sync with the same settings state', async () => {
    renderContent();

    await waitFor(() => {
      expect(rowTitles()).toEqual(['Alpha', 'Beta']);
    });

    // Radix Tabs activates on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Graph/ }), { button: 0 });
    await screen.findByTestId('relationship-canvas');

    // The inline canvas requests fullscreen; the dialog mounts a second
    // instance which must receive the same state and the same handlers.
    act(() => {
      harness.canvasProps.current?.onRequestFullscreen?.();
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('relationship-canvas')).toHaveLength(2);
    });
    expect(harness.canvasProps.current?.onRequestFullscreen).toBeUndefined();
    expect(harness.canvasProps.current).toMatchObject({ viewMode: 'compact' });

    // A settings change made through the fullscreen instance updates both.
    act(() => {
      harness.canvasProps.current?.onViewModeChange('erd');
    });
    expect(harness.canvasProps.current).toMatchObject({ viewMode: 'erd' });
    expect(localStorage.getItem('relationship-canvas-view-mode')).toBe('erd');
  });

  it('lets the toolbar wrap so controls stay reachable in narrow layouts', async () => {
    renderContent();

    const statusSelect = await screen.findByRole('combobox', { name: 'Status' });
    // jsdom cannot measure overflow; asserting the wrap class is the closest
    // regression guard for the ~600px edit layout.
    expect(statusSelect.parentElement).toHaveClass('flex-wrap');
  });
});

describe('DataMartRelationshipsContent blendable schema', () => {
  it('refetches on an invalidation of the shared key, which is what every mutation path fires', async () => {
    // This card used to refetch from an effect keyed on its relationship list; it now reads the
    // draft-inclusive query variant, so the refresh comes from prefix invalidation — the call every
    // create/rename/delete/config-save already makes.
    const service = vi.mocked(dataMartRelationshipService);
    // The service mock is module-level and every earlier test in this file rendered through it.
    service.getBlendableSchema.mockClear();
    const { queryClient } = renderContent();

    await waitFor(() => {
      expect(service.getBlendableSchema).toHaveBeenCalledTimes(1);
    });
    expect(service.getBlendableSchema).toHaveBeenCalledWith(
      'dm-1',
      { includeDraftTargets: true },
      { skipLoadingIndicator: true }
    );

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: [BLENDABLE_SCHEMA_QUERY_KEY] });
    });

    expect(service.getBlendableSchema).toHaveBeenCalledTimes(2);
  });
});

describe('DataMartRelationshipsContent config saves', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const source = { aliasPath: 'alpha', alias: 'Alpha' } as SourceEntry;

  const saveDescription = (description: string) => {
    act(() => {
      harness.accordionProps.current?.onDescriptionOverrideChange(source, description);
    });
  };

  const savedDescriptions = () =>
    vi
      .mocked(dataMartRelationshipService)
      .updateBlendedFieldsConfig.mock.calls.map(
        ([, config]) => config?.sources.find(entry => entry.path === 'alpha')?.description
      );

  beforeEach(async () => {
    vi.mocked(dataMartRelationshipService).updateBlendedFieldsConfig.mockReset();
    harness.syncDataMartFromResponse.mockClear();
    harness.toast.error.mockClear();
    harness.accordionProps.current = null;
  });

  it('runs one save at a time and sends only the newest queued config', async () => {
    const first = deferred<unknown>();
    const service = vi.mocked(dataMartRelationshipService);
    service.updateBlendedFieldsConfig
      .mockReturnValueOnce(first.promise as never)
      .mockResolvedValue({} as never);

    renderContent();
    await waitFor(() => {
      expect(harness.accordionProps.current).not.toBeNull();
    });

    saveDescription('first');
    expect(service.updateBlendedFieldsConfig).toHaveBeenCalledTimes(1);

    // Two more edits land while the first PUT is still open — each one carries the whole
    // config, so the middle one is dropped rather than queued behind the newest.
    saveDescription('second');
    saveDescription('third');
    expect(service.updateBlendedFieldsConfig).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({});
    });

    await waitFor(() => {
      expect(service.updateBlendedFieldsConfig).toHaveBeenCalledTimes(2);
    });
    expect(savedDescriptions()).toEqual(['first', 'third']);
    // The superseded response must not be applied as the saved state.
    expect(harness.syncDataMartFromResponse).toHaveBeenCalledTimes(1);
  });

  it('warns and stops showing the edit as saved when the request fails', async () => {
    const failing = deferred<unknown>();
    const service = vi.mocked(dataMartRelationshipService);
    service.updateBlendedFieldsConfig.mockReturnValueOnce(failing.promise as never);

    renderContent();
    await waitFor(() => {
      expect(harness.accordionProps.current).not.toBeNull();
    });

    saveDescription('doomed');

    await act(async () => {
      failing.reject(new Error('network down'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(harness.toast.error).toHaveBeenCalledWith('Failed to save changes');
    });
    expect(harness.syncDataMartFromResponse).not.toHaveBeenCalled();
  });
});

describe('DataMartRelationshipsContent relationship saves', () => {
  const service = vi.mocked(dataMartRelationshipService);
  const SCHEMA_KEY = [BLENDABLE_SCHEMA_QUERY_KEY, 'dm-1', 'include-draft-targets'];

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
      resolve = res;
    });
    return { promise, resolve };
  }

  const buildSource = (aliasPath: string, relationshipId: string): AvailableSource => ({
    aliasPath,
    title: aliasPath,
    defaultAlias: aliasPath,
    depth: aliasPath.split('.').length,
    fieldCount: 1,
    isIncluded: true,
    relationshipId,
    dataMartId: `dm-${aliasPath}`,
    isAccessibleForReporting: true,
  });

  beforeEach(() => {
    service.getRelationshipGraph.mockClear();
    service.getBlendableSchema.mockClear();
    service.updateBlendedFieldsConfig.mockReset();
    harness.toast.success.mockClear();
    harness.accordionPropsByRowKey.clear();
  });

  async function renderRows() {
    const rendered = renderContent();
    await waitFor(() => {
      expect(harness.accordionPropsByRowKey.get('alpha')).toBeDefined();
    });
    await waitFor(() => {
      expect(service.getBlendableSchema).toHaveBeenCalledTimes(1);
    });
    return rendered;
  }

  it('applies a description autosave in place: rows stay mounted, no reload, no toast', async () => {
    await renderRows();
    const alpha = harness.accordionPropsByRowKey.get('alpha')!;
    const rowBefore = screen.getAllByTestId('relationship-row')[0];

    act(() => {
      alpha.onRelationshipDescriptionSaved({
        ...alpha.row.relationship,
        description: 'Product where run was occurring',
        modifiedAt: '2026-09-22T12:00:00.000Z',
      });
    });

    // The graph was fetched once on mount and never again: no skeleton, no unmount of the
    // expanded row and its focused textarea while the user is still typing.
    expect(service.getRelationshipGraph).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('relationship-row')[0]).toBe(rowBefore);
    expect(screen.getByTestId('relationship-description-alpha')).toHaveTextContent(
      'Product where run was occurring'
    );
    expect(screen.getByTestId('relationship-description-beta')).toHaveTextContent('');
    // The server's copy is merged whole, not field by field.
    expect(harness.accordionPropsByRowKey.get('alpha')?.row.relationship.modifiedAt).toBe(
      '2026-09-22T12:00:00.000Z'
    );
    // Silent, like the row's other autosaving fields — a toast after every typing pause is noise.
    expect(harness.toast.success).not.toHaveBeenCalled();
  });

  it('patches the cached blendable schema instead of refetching it, keeping per-join overrides', async () => {
    service.getBlendableSchema.mockResolvedValueOnce({
      ...harness.schema,
      availableSources: [
        buildSource('alpha', 'rel-alpha'),
        { ...buildSource('beta.alpha', 'rel-alpha'), joinDescription: 'own text' },
        buildSource('beta', 'rel-beta'),
      ],
    });
    service.updateBlendedFieldsConfig.mockResolvedValue({} as never);
    const { queryClient } = await renderRows();
    const alpha = harness.accordionPropsByRowKey.get('alpha')!;

    // The transient reuse of the same relationship carries its own override.
    act(() => {
      alpha.onDescriptionOverrideChange(
        { aliasPath: 'beta.alpha', alias: 'Alpha' } as SourceEntry,
        'own text'
      );
    });
    act(() => {
      alpha.onRelationshipDescriptionSaved({
        ...alpha.row.relationship,
        description: 'Product where run was occurring',
      });
    });

    const cached = queryClient.getQueryData<BlendableSchema>(SCHEMA_KEY);
    const byPath = new Map(cached?.availableSources.map(s => [s.aliasPath, s.joinDescription]));
    expect(byPath.get('alpha')).toBe('Product where run was occurring');
    expect(byPath.get('beta.alpha')).toBe('own text');
    expect(byPath.get('beta')).toBeUndefined();
    expect(service.getBlendableSchema).toHaveBeenCalledTimes(1);

    // Clearing the description drops the effective text where nothing overrides it.
    act(() => {
      alpha.onRelationshipDescriptionSaved({ ...alpha.row.relationship, description: undefined });
    });
    const cleared = queryClient.getQueryData<BlendableSchema>(SCHEMA_KEY);
    expect(cleared?.availableSources.find(s => s.aliasPath === 'alpha')).not.toHaveProperty(
      'joinDescription'
    );
    expect(cleared?.availableSources.find(s => s.aliasPath === 'beta.alpha')?.joinDescription).toBe(
      'own text'
    );
  });

  it('re-applies a description saved while a reload was in flight over the stale response', async () => {
    await renderRows();
    const alpha = harness.accordionPropsByRowKey.get('alpha')!;

    // A Join Settings save reloads the graph; the reload is answered from before the
    // description PATCH committed, so the payload it returns still lacks the description.
    const reload = deferred<RelationshipGraph>();
    service.getRelationshipGraph.mockReturnValueOnce(reload.promise);
    act(() => {
      alpha.onRelationshipUpdated({ ...alpha.row.relationship });
    });
    expect(service.getRelationshipGraph).toHaveBeenCalledTimes(2);

    act(() => {
      alpha.onRelationshipDescriptionSaved({ ...alpha.row.relationship, description: 'late' });
    });
    await act(async () => {
      reload.resolve(harness.graph);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('relationship-description-alpha')).toHaveTextContent('late');
    });
    expect(screen.getByTestId('relationship-description-beta')).toHaveTextContent('');
  });

  it('still reloads the list after a Join Settings save', async () => {
    await renderRows();
    const alpha = harness.accordionPropsByRowKey.get('alpha')!;

    act(() => {
      alpha.onRelationshipUpdated({ ...alpha.row.relationship, targetAlias: 'alpha' });
    });

    await waitFor(() => {
      expect(service.getRelationshipGraph).toHaveBeenCalledTimes(2);
    });
    expect(harness.toast.success).toHaveBeenCalledWith('Relationship updated');
  });
});
