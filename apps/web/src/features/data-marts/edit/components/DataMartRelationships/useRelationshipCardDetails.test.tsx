import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import {
  useRelationshipCardDetails,
  type RelationshipCardRoot,
} from './useRelationshipCardDetails';

const mocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  getEdges: vi.fn(),
  getSummaries: vi.fn(),
  startRun: vi.fn(),
  getDataMartById: vi.fn(),
  getDataStorages: vi.fn(),
  wasErrorToastShown: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ projectId: 'project-1' }),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('../../../../../app/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../app/api')>()),
  wasErrorToastShown: mocks.wasErrorToastShown,
}));

vi.mock('../../../model-canvas/api/model-canvas.service', () => ({
  modelCanvasService: { getDataMarts: mocks.getDataMarts, getEdges: mocks.getEdges },
}));

vi.mock('../../../shared/services/data-mart.service', () => ({
  dataMartService: { getDataMartById: mocks.getDataMartById },
}));

vi.mock('../../../data-quality/api/data-quality.service', () => ({
  dataQualityService: { getSummaries: mocks.getSummaries, startRun: mocks.startRun },
}));

vi.mock('../../../../data-storage/shared/api', () => ({
  dataStorageApiService: { getDataStorages: mocks.getDataStorages },
}));

const ROOT: RelationshipCardRoot = {
  id: 'orders',
  storageId: 'storage-1',
  icon: 'cart' as RelationshipCardRoot['icon'],
  dataLastUpdated: null,
  availableForReporting: true,
  availableForMaintenance: false,
};

const RELATIONSHIPS = [
  relationship('rel-1', 'customers', true),
  relationship('rel-2', 'secret', false),
];

const MODEL_NODES = [
  modelNode('orders', { triggersCount: 1, reportsCount: 2 }),
  modelNode('customers', { triggersCount: 0, reportsCount: 3 }),
  modelNode('secret', { triggersCount: 5, reportsCount: 5 }),
];

const MODEL_EDGES = [
  { id: 'e1', sourceDataMartId: 'orders', targetDataMartId: 'customers', joinConditions: [] },
  { id: 'e2', sourceDataMartId: 'customers', targetDataMartId: 'secret', joinConditions: [] },
];

const CUSTOMERS_FRESHNESS = { dataLastUpdatedAt: '2026-11-27T10:00:00.000Z', coverage: 'complete' };

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderDetails(enabled = true) {
  return renderHook(
    () =>
      useRelationshipCardDetails({
        root: ROOT,
        relationshipGraph: null,
        relationships: RELATIONSHIPS,
        enabled,
      }),
    { wrapper: createWrapper() }
  );
}

describe('useRelationshipCardDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDataStorages.mockResolvedValue([{ id: 'storage-1' }]);
    mocks.getDataMarts.mockResolvedValue(MODEL_NODES);
    mocks.getEdges.mockResolvedValue(MODEL_EDGES);
    mocks.getSummaries.mockResolvedValue({});
    mocks.getDataMartById.mockResolvedValue({
      definitionType: 'VIEW',
      icon: 'user',
      dataLastUpdated: CUSTOMERS_FRESHNESS,
      availableForReporting: false,
      availableForMaintenance: true,
    });
  });

  it('gives each card its own facts and, for a Storage the user can see, the model counts', async () => {
    const { result } = renderDetails();

    await waitFor(() => {
      expect(result.current.cardDetails.get('customers')?.reportsCount).toBe(3);
    });
    expect(result.current.definitionTypes.get('customers')).toBe('VIEW');
    expect(result.current.cardDetails.get('customers')).toMatchObject({
      icon: 'user',
      dataLastUpdated: CUSTOMERS_FRESHNESS,
      triggersCount: 0,
      reportsCount: 3,
      relationshipCount: 2,
      availableForReporting: false,
      availableForMaintenance: true,
    });
    // The root's own facts come from the edit page.
    expect(result.current.cardDetails.get('orders')).toMatchObject({
      icon: 'cart',
      triggersCount: 1,
      reportsCount: 2,
      relationshipCount: 1,
      availableForReporting: true,
      availableForMaintenance: false,
    });
  });

  it('without access to the Storage, keeps the cards their own facts and asks for no model', async () => {
    mocks.getDataStorages.mockResolvedValue([{ id: 'another-storage' }]);

    const { result } = renderDetails();

    await waitFor(() => {
      expect(result.current.cardDetails.get('customers')).toBeDefined();
    });
    expect(result.current.cardDetails.get('customers')).toMatchObject({
      icon: 'user',
      dataLastUpdated: CUSTOMERS_FRESHNESS,
      availableForMaintenance: true,
      triggersCount: undefined,
      reportsCount: undefined,
      relationshipCount: undefined,
    });
    expect(result.current.cardDetails.get('orders')).toMatchObject({
      icon: 'cart',
      availableForReporting: true,
    });
    expect(mocks.getDataMarts).not.toHaveBeenCalled();
    expect(mocks.getEdges).not.toHaveBeenCalled();
  });

  it('shows no facts until the quality summaries are in, so the footer appears once', async () => {
    let resolveSummaries: (value: object) => void = () => undefined;
    mocks.getSummaries.mockReturnValue(
      new Promise(resolve => {
        resolveSummaries = resolve;
      })
    );

    const { result } = renderDetails();

    await waitFor(() => {
      expect(result.current.definitionTypes.get('customers')).toBe('VIEW');
    });
    expect(result.current.cardDetails.size).toBe(0);

    act(() => {
      resolveSummaries({});
    });

    await waitFor(() => {
      expect(result.current.cardDetails.get('orders')).toBeDefined();
    });
  });

  it('leaves out a Data Mart the user cannot open, even when the model lists it', async () => {
    const { result } = renderDetails();

    await waitFor(() => {
      expect(result.current.cardDetails.get('customers')?.reportsCount).toBe(3);
    });
    expect(result.current.cardDetails.has('secret')).toBe(false);
    expect(mocks.getDataMartById).not.toHaveBeenCalledWith('secret', expect.anything());
    expect(mocks.getSummaries).toHaveBeenCalledWith(['customers', 'orders'], expect.anything());
  });

  it('asks for nothing while disabled', async () => {
    const { result } = renderDetails(false);

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.getDataStorages).not.toHaveBeenCalled();
    expect(mocks.getDataMarts).not.toHaveBeenCalled();
    expect(mocks.getDataMartById).not.toHaveBeenCalled();
    expect(mocks.getSummaries).not.toHaveBeenCalled();
    expect(result.current.cardDetails.size).toBe(0);
  });

  it('rereads the storage model when a relationship changes', async () => {
    const { result } = renderDetails();
    await waitFor(() => {
      expect(result.current.cardDetails.get('orders')?.reportsCount).toBe(2);
    });
    expect(mocks.getDataMarts).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.invalidateModel();
    });

    await waitFor(() => {
      expect(mocks.getDataMarts).toHaveBeenCalledTimes(2);
    });
  });

  it('starts a Data Quality run and rereads the summaries', async () => {
    mocks.startRun.mockResolvedValue({});
    const { result } = renderDetails();
    await waitFor(() => {
      expect(result.current.cardDetails.get('orders')).toBeDefined();
    });
    const summaryReads = mocks.getSummaries.mock.calls.length;

    await act(() => result.current.runQuality('customers'));

    expect(mocks.startRun).toHaveBeenCalledWith('customers');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Data Quality run queued');
    expect(mocks.getSummaries.mock.calls.length).toBeGreaterThan(summaryReads);
  });

  it('adds no second toast to a refused run the API client already reported', async () => {
    mocks.startRun.mockRejectedValue(new Error('Forbidden'));
    mocks.wasErrorToastShown.mockReturnValue(true);
    const { result } = renderDetails();

    await act(() => result.current.runQuality('customers'));

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

function relationship(id: string, targetId: string, userHasAccess: boolean): DataMartRelationship {
  return {
    id,
    dataStorageId: 'storage-1',
    sourceDataMart: { id: 'orders', title: 'Orders', status: 'PUBLISHED', userHasAccess: true },
    targetDataMart: { id: targetId, title: targetId, status: 'PUBLISHED', userHasAccess },
    targetAlias: targetId,
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'order_id' }],
    createdById: 'user-1',
    createdAt: '2026-11-27T00:00:00.000Z',
    modifiedAt: '2026-11-27T00:00:00.000Z',
  };
}

function modelNode(id: string, counts: { triggersCount: number; reportsCount: number }) {
  return {
    id,
    title: id,
    status: 'PUBLISHED',
    description: null,
    icon: null,
    fieldCount: 3,
    dataLastUpdated: null,
    ...counts,
  };
}
