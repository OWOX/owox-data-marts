import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import {
  useRelationshipCardDetails,
  type RelationshipCardRoot,
} from './useRelationshipCardDetails';

const serviceMocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  getEdges: vi.fn(),
  getSummaries: vi.fn(),
  getDataMartById: vi.fn(),
}));

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ projectId: 'project-1' }),
}));

vi.mock('../../../model-canvas/api/model-canvas.service', () => ({
  modelCanvasService: serviceMocks,
}));

vi.mock('../../../shared/services/data-mart.service', () => ({
  dataMartService: { getDataMartById: serviceMocks.getDataMartById },
}));

vi.mock('../../../data-quality/api/data-quality.service', () => ({
  dataQualityService: { getSummaries: serviceMocks.getSummaries },
}));

const ROOT: RelationshipCardRoot = {
  id: 'orders',
  storageId: 'storage-1',
  icon: 'cart' as RelationshipCardRoot['icon'],
  availableForReporting: true,
  availableForMaintenance: false,
};

const RELATIONSHIPS = [
  relationship('rel-1', 'customers', true),
  relationship('rel-2', 'secret', false),
];

const MODEL_NODES = [
  modelNode('orders', { icon: null, triggersCount: 1, reportsCount: 2 }),
  modelNode('customers', { icon: 'user', triggersCount: 0, reportsCount: 3 }),
  modelNode('secret', { icon: null, triggersCount: 5, reportsCount: 5 }),
];

const MODEL_EDGES = [
  { id: 'e1', sourceDataMartId: 'orders', targetDataMartId: 'customers', joinConditions: [] },
  { id: 'e2', sourceDataMartId: 'customers', targetDataMartId: 'secret', joinConditions: [] },
];

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
    serviceMocks.getEdges.mockResolvedValue(MODEL_EDGES);
    serviceMocks.getSummaries.mockResolvedValue({});
    serviceMocks.getDataMartById.mockResolvedValue({
      definitionType: 'VIEW',
      availableForReporting: false,
      availableForMaintenance: true,
    });
  });

  it('shows no facts until the storage model is in, then the model and detail facts', async () => {
    let resolveModel: (nodes: typeof MODEL_NODES) => void = () => undefined;
    serviceMocks.getDataMarts.mockReturnValue(
      new Promise(resolve => {
        resolveModel = resolve;
      })
    );

    const { result } = renderDetails();

    // The details of the related Data Mart arrive first…
    await waitFor(() => {
      expect(result.current.definitionTypes.get('customers')).toBe('VIEW');
    });
    // …but without the model a footer would read "Unknown", so no card has facts yet.
    expect(result.current.cardDetails.size).toBe(0);

    act(() => {
      resolveModel(MODEL_NODES);
    });

    await waitFor(() => {
      expect(result.current.cardDetails.get('customers')).toBeDefined();
    });
    expect(result.current.cardDetails.get('customers')).toMatchObject({
      icon: 'user',
      triggersCount: 0,
      reportsCount: 3,
      relationshipCount: 2,
      availableForReporting: false,
      availableForMaintenance: true,
    });
    // The root keeps the edit page's icon and sharing, and takes the counts from the model.
    expect(result.current.cardDetails.get('orders')).toMatchObject({
      icon: 'cart',
      triggersCount: 1,
      reportsCount: 2,
      relationshipCount: 1,
      availableForReporting: true,
      availableForMaintenance: false,
    });
  });

  it('leaves out a Data Mart the user cannot open, even when the model lists it', async () => {
    serviceMocks.getDataMarts.mockResolvedValue(MODEL_NODES);

    const { result } = renderDetails();

    await waitFor(() => {
      expect(result.current.cardDetails.get('customers')).toBeDefined();
    });
    expect(result.current.cardDetails.has('secret')).toBe(false);
    expect(serviceMocks.getDataMartById).not.toHaveBeenCalledWith('secret', expect.anything());
    expect(serviceMocks.getSummaries).toHaveBeenCalledWith(
      ['customers', 'orders'],
      expect.anything()
    );
  });

  it('asks for nothing while disabled', async () => {
    serviceMocks.getDataMarts.mockResolvedValue(MODEL_NODES);

    const { result } = renderDetails(false);

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(serviceMocks.getDataMarts).not.toHaveBeenCalled();
    expect(serviceMocks.getDataMartById).not.toHaveBeenCalled();
    expect(serviceMocks.getSummaries).not.toHaveBeenCalled();
    expect(result.current.cardDetails.size).toBe(0);
  });

  it('rereads the storage model when a relationship changes', async () => {
    serviceMocks.getDataMarts.mockResolvedValue(MODEL_NODES);

    const { result } = renderDetails();
    await waitFor(() => {
      expect(result.current.cardDetails.get('orders')).toBeDefined();
    });
    expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.invalidateModel();
    });

    await waitFor(() => {
      expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(2);
    });
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

function modelNode(
  id: string,
  facts: { icon: string | null; triggersCount: number; reportsCount: number }
) {
  return {
    id,
    title: id,
    status: 'PUBLISHED',
    description: null,
    fieldCount: 3,
    dataLastUpdated: null,
    ...facts,
  };
}
