import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BlendableSchema,
  DataMartRelationship,
  RelationshipGraph,
} from '../../shared/types/relationship.types';
import { dataMartRelationshipService } from '../../shared/services/data-mart-relationship.service';
import RelationshipDetailsSheet, { type RelationshipSheetOption } from './RelationshipDetailsSheet';

interface JoinSettingsStubProps {
  relationship: DataMartRelationship;
  dataMartId: string;
  siblingAliases: string[];
  readOnly?: boolean;
  onSaved: (updated: DataMartRelationship) => void;
}

const harness = vi.hoisted(() => ({
  joinSettingsProps: { current: null as JoinSettingsStubProps | null },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({ default: harness.toast, toast: harness.toast }));

vi.mock('../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({
    navigate: vi.fn(),
    scope: (path: string) => `/ui/project-1${path}`,
    projectId: 'project-1',
  }),
}));

vi.mock('../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    getRelationshipGraph: vi.fn(),
    getBlendableSchema: vi.fn(),
    updateBlendedFieldsConfig: vi.fn(),
    deleteRelationship: vi.fn(),
  },
}));

vi.mock('../../shared/services/data-mart.service', () => ({
  dataMartService: {
    getDataMartById: vi.fn(() =>
      Promise.resolve({ id: 'orders', blendedFieldsConfig: { sources: [] } })
    ),
  },
}));

// The forms have their own tests; here they only show what the sheet hands them.
vi.mock('../../edit/components/DataMartRelationships/JoinSettingsForm', () => ({
  JoinSettingsForm: (props: JoinSettingsStubProps) => {
    harness.joinSettingsProps.current = props;
    return <div data-testid='join-settings'>{props.relationship.targetAlias}</div>;
  },
}));

vi.mock('../../edit/components/DataMartRelationships/JoinDescriptionForm', () => ({
  JoinDescriptionForm: () => <div data-testid='join-description' />,
}));

function buildRelationship(
  id: string,
  source: { id: string; title: string },
  target: { id: string; title: string },
  overrides: Partial<DataMartRelationship> = {}
): DataMartRelationship {
  return {
    id,
    dataStorageId: 'storage-1',
    sourceDataMart: { ...source, status: 'PUBLISHED', userHasAccess: true, hasPrimaryKey: true },
    targetDataMart: { ...target, status: 'PUBLISHED', userHasAccess: true, hasPrimaryKey: true },
    targetAlias: target.id,
    joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
    createdById: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    modifiedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const ORDERS = { id: 'orders', title: 'Orders' };
const CUSTOMERS = { id: 'customers', title: 'Customers' };
const PRODUCTS = { id: 'products', title: 'Products' };

function graphOf(...relationships: DataMartRelationship[]): RelationshipGraph {
  return {
    rootDataMartId: relationships[0]?.sourceDataMart.id ?? '',
    nodes: relationships.map(relationship => ({
      relationship,
      aliasPath: relationship.targetAlias,
      depth: 1,
      isCycleStub: false,
      isBlocked: false,
    })),
  };
}

const EMPTY_SCHEMA: BlendableSchema = { nativeFields: [], blendedFields: [], availableSources: [] };

function renderSheet(
  options: RelationshipSheetOption[],
  props: { relationshipId?: string; onClose?: () => void; onRelationshipChange?: () => void } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  const onRelationshipChange = props.onRelationshipChange ?? vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/ui/project-1/data-marts/models']}>
        <Routes>
          <Route path='/ui/:projectId/data-marts/models' element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(
    <RelationshipDetailsSheet
      options={options}
      relationshipId={props.relationshipId ?? options[0].id}
      storageId='storage-1'
      onRelationshipChange={onRelationshipChange}
      onClose={onClose}
    />,
    { wrapper }
  );
  return { queryClient, onClose, onRelationshipChange };
}

describe('RelationshipDetailsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.joinSettingsProps.current = null;
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue(EMPTY_SCHEMA);
  });

  it("opens on the join settings of the relationship, edited through its source's relationships", async () => {
    vi.mocked(dataMartRelationshipService.getRelationshipGraph).mockResolvedValue(
      graphOf(
        buildRelationship('r-customers', ORDERS, CUSTOMERS, { joinConditions: [] }),
        buildRelationship('r-products', ORDERS, PRODUCTS)
      )
    );

    renderSheet([{ id: 'r-customers', source: ORDERS, target: CUSTOMERS }]);

    expect(await screen.findByTestId('join-settings')).toHaveTextContent('customers');
    expect(dataMartRelationshipService.getRelationshipGraph).toHaveBeenCalledWith(
      'orders',
      expect.anything()
    );
    expect(harness.joinSettingsProps.current).toMatchObject({
      dataMartId: 'orders',
      siblingAliases: ['products'],
      readOnly: false,
    });
    expect(screen.getByText('Join not configured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Orders/ })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/orders/data-setup'
    );
    expect(screen.getByRole('link', { name: /Customers/ })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/customers/data-setup'
    );
  });

  it('offers both directions of a two-headed arrow', async () => {
    vi.mocked(dataMartRelationshipService.getRelationshipGraph).mockResolvedValue(
      graphOf(buildRelationship('r-forward', ORDERS, CUSTOMERS))
    );

    const { onRelationshipChange } = renderSheet([
      { id: 'r-forward', source: ORDERS, target: CUSTOMERS },
      { id: 'r-back', source: CUSTOMERS, target: ORDERS },
    ]);

    await screen.findByTestId('join-settings');
    const back = screen.getByRole('tab', { name: 'Customers → Orders' });
    fireEvent.mouseDown(back, { button: 0 });
    expect(onRelationshipChange).toHaveBeenCalledWith('r-back');
  });

  it('refreshes the canvas after a join settings save', async () => {
    const relationship = buildRelationship('r-customers', ORDERS, CUSTOMERS);
    vi.mocked(dataMartRelationshipService.getRelationshipGraph).mockResolvedValue(
      graphOf(relationship)
    );
    const { queryClient } = renderSheet([{ id: 'r-customers', source: ORDERS, target: CUSTOMERS }]);
    await screen.findByTestId('join-settings');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    harness.joinSettingsProps.current?.onSaved({
      ...relationship,
      joinConditions: [{ sourceFieldName: 'customer_key', targetFieldName: 'id' }],
    });

    expect(harness.toast.success).toHaveBeenCalledWith('Relationship updated');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['model-canvas', 'project-1', 'storage-1'],
    });
  });

  it('turns reporting off for the join in the blended fields config of its source', async () => {
    vi.mocked(dataMartRelationshipService.getRelationshipGraph).mockResolvedValue(
      graphOf(buildRelationship('r-customers', ORDERS, CUSTOMERS))
    );
    vi.mocked(dataMartRelationshipService.updateBlendedFieldsConfig).mockResolvedValue(
      {} as Awaited<ReturnType<typeof dataMartRelationshipService.updateBlendedFieldsConfig>>
    );
    renderSheet([{ id: 'r-customers', source: ORDERS, target: CUSTOMERS }]);
    await screen.findByTestId('join-settings');

    fireEvent.click(screen.getByRole('switch', { name: 'Allow for reporting' }));

    await waitFor(() => {
      expect(dataMartRelationshipService.updateBlendedFieldsConfig).toHaveBeenCalledWith(
        'orders',
        { sources: [{ path: 'customers', alias: 'customers', isExcluded: true }] },
        expect.anything()
      );
    });
  });

  it('deletes the relationship from its source and closes', async () => {
    vi.mocked(dataMartRelationshipService.getRelationshipGraph).mockResolvedValue(
      graphOf(buildRelationship('r-customers', ORDERS, CUSTOMERS))
    );
    vi.mocked(dataMartRelationshipService.deleteRelationship).mockResolvedValue(undefined);
    const { onClose } = renderSheet([{ id: 'r-customers', source: ORDERS, target: CUSTOMERS }]);
    await screen.findByTestId('join-settings');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete relationship' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(dataMartRelationshipService.deleteRelationship).toHaveBeenCalledWith(
      'orders',
      'r-customers',
      expect.anything()
    );
  });

  it('says so when the relationship is no longer there', async () => {
    vi.mocked(dataMartRelationshipService.getRelationshipGraph).mockResolvedValue(
      graphOf(buildRelationship('r-products', ORDERS, PRODUCTS))
    );

    renderSheet([{ id: 'r-customers', source: ORDERS, target: CUSTOMERS }]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This relationship could not be loaded'
    );
  });
});
