// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartListProvider } from '../context';
import { useDataMartList } from './useDataMartList';

const mocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  deleteDataMart: vi.fn(),
  publishDataMart: vi.fn(),
  createSchemaActualizeTrigger: vi.fn(),
  mapDataMartListFromDto: vi.fn((items: unknown) => items),
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

vi.mock('../../../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const wrapper = ({ children }: PropsWithChildren) => (
  <DataMartListProvider>{children}</DataMartListProvider>
);

describe('useDataMartList quality polling', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('silently polls active quality summaries and stops when the refreshed list is terminal', async () => {
    vi.useFakeTimers();
    mocks.getDataMarts
      .mockResolvedValueOnce([listItem('RUNNING')])
      .mockResolvedValue([listItem('PASSED')]);
    const { result } = renderHook(() => useDataMartList(), { wrapper });

    await act(async () => {
      await result.current.loadDataMarts();
    });
    expect(result.current.items[0]?.qualitySummary.state).toBe('RUNNING');
    expect(mocks.getDataMarts).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await vi.waitFor(() => {
      expect(result.current.items[0]?.qualitySummary.state).toBe('PASSED');
    });
    expect(result.current.loading).toBe(false);
    expect(mocks.getDataMarts).toHaveBeenCalledTimes(2);
    expect(mocks.getDataMarts).toHaveBeenNthCalledWith(2, {
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(mocks.getDataMarts).toHaveBeenCalledTimes(2);
  });
});

function listItem(state: 'RUNNING' | 'PASSED') {
  return {
    id: 'mart-1',
    title: 'Orders',
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
    qualitySummary: {
      state,
      enabledChecks: 1,
      totalChecks: 1,
      passedChecks: state === 'PASSED' ? 1 : 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
      dataMartRunId: 'run-1',
      lastRunAt: '2026-07-16T10:00:00.000Z',
    },
  };
}
