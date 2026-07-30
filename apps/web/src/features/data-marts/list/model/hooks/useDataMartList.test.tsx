// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartListProvider } from '../context';
import { useDataMartList } from './useDataMartList';

const mocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  deleteDataMart: vi.fn(),
  publishDataMart: vi.fn(),
  createSchemaActualizeTrigger: vi.fn(),
  getSummaries: vi.fn(),
  mapDataMartListFromDto: vi.fn((items: ReturnType<typeof apiListItem>[]) => items),
}));

vi.mock('../../../shared', () => ({
  dataMartService: {
    getDataMarts: mocks.getDataMarts,
    deleteDataMart: mocks.deleteDataMart,
    publishDataMart: mocks.publishDataMart,
    createSchemaActualizeTrigger: mocks.createSchemaActualizeTrigger,
  },
}));

vi.mock('../mappers/data-mart-list.mapper.ts', () => ({
  mapDataMartListFromDto: mocks.mapDataMartListFromDto,
}));

vi.mock('../../../data-quality/api/data-quality.service', () => ({
  dataQualityService: {
    getSummaries: mocks.getSummaries,
  },
}));

vi.mock('../../../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const wrapper = ({ children }: PropsWithChildren) => (
  <DataMartListProvider>{children}</DataMartListProvider>
);

describe('useDataMartList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the generic list without requesting Data Quality summaries', async () => {
    mocks.getDataMarts.mockResolvedValue([apiListItem()]);
    const { result } = renderHook(() => useDataMartList(), { wrapper });

    await act(async () => {
      await result.current.loadDataMarts();
    });

    expect(mocks.getDataMarts).toHaveBeenCalledTimes(1);
    expect(mocks.mapDataMartListFromDto).toHaveBeenCalledWith([apiListItem()]);
    expect(mocks.getSummaries).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([apiListItem()]);
  });
});

function apiListItem(title = 'Orders') {
  return {
    id: 'mart-1',
    title,
    status: { code: 'PUBLISHED', title: 'Published' },
    storageType: 'GOOGLE_BIGQUERY',
    triggersCount: 0,
    reportsCount: 0,
    createdByUser: null,
    createdAt: new Date('2026-07-16T09:00:00.000Z'),
    modifiedAt: new Date('2026-07-16T09:00:00.000Z'),
    definitionType: 'TABLE',
    connectorSourceName: null,
    businessOwnerUsers: [],
    technicalOwnerUsers: [],
    contexts: [],
  };
}
