import type { ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
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
    return <div data-testid='relationship-row'>{props.row.relationship.targetDataMart.title}</div>;
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
    // shared query the schema editor's formula autocomplete reads too, so the refresh comes from
    // `invalidateBlendableSchema` — the call every create/rename/delete/config-save already makes.
    const service = vi.mocked(dataMartRelationshipService);
    // The service mock is module-level and every earlier test in this file rendered through it.
    service.getBlendableSchema.mockClear();
    const { queryClient } = renderContent();

    await waitFor(() => {
      expect(service.getBlendableSchema).toHaveBeenCalledTimes(1);
    });

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
