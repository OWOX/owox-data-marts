import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../../../../../utils', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../../../../../data-marts/reports/shared/model/hooks/useReport', () => ({
  useReport: vi.fn(),
}));

import { useReport } from '../../../../../data-marts/reports/shared/model/hooks/useReport';
import { useLookerStudioReportForm } from '../useLookerStudioReportForm';
import { DestinationTypeConfigEnum } from '../../../shared/enums/destination-type-config.enum';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import type { FilterRule } from '../../../../shared/types/output-config';

const mockCreateReport = vi.fn();
const mockUpdateReport = vi.fn();
const mockClearError = vi.fn();

function setupUseReportMock(overrides: Partial<ReturnType<typeof useReport>> = {}) {
  (useReport as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    updateReport: mockUpdateReport,
    createReport: mockCreateReport,
    clearError: mockClearError,
    error: null,
    destinations: [],
    reports: [],
    currentReport: null,
    loading: false,
    polledReportIds: [],
    fetchDestinations: vi.fn(),
    fetchReports: vi.fn(),
    fetchReportsByDataMartId: vi.fn(),
    fetchReportById: vi.fn(),
    deleteReport: vi.fn(),
    runReport: vi.fn(),
    startPollingReport: vi.fn(),
    stopPollingReport: vi.fn(),
    stopAllPolling: vi.fn(),
    setPollingConfig: vi.fn(),
    clearCurrentReport: vi.fn(),
    ...overrides,
  });
}

function buildReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'report-1',
    title: 'Existing',
    dataMart: { id: 'dm-1' },
    dataDestination: {
      id: 'dest-1',
      type: 'looker-studio',
      title: 'LS',
    } as unknown as DataMartReport['dataDestination'],
    destinationConfig: {
      type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
      cacheLifetime: 600,
    } as DataMartReport['destinationConfig'],
    columnConfig: ['col_a'],
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    ...overrides,
  } as DataMartReport;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupUseReportMock();
  mockCreateReport.mockResolvedValue(buildReport({ id: 'created-1' }));
  mockUpdateReport.mockResolvedValue(buildReport({ id: 'updated-1' }));
});

describe('useLookerStudioReportForm — defaults', () => {
  it('seeds output controls from initialReport (post+pre-join mix)', () => {
    const preJoinRule: FilterRule = {
      column: 'plan',
      operator: 'eq',
      value: 'enterprise',
      placement: 'pre-join',
      aliasPath: 'orgs',
    };
    const initial = buildReport({
      columnConfig: ['col_a', 'col_b'],
      filterConfig: [{ column: 'col_a', operator: 'neq', value: 'x' }, preJoinRule],
      sortConfig: [{ column: 'col_a', direction: 'desc' }],
      limitConfig: 1000,
    });

    const { result } = renderHook(() =>
      useLookerStudioReportForm({ initialReport: initial, dataMartId: 'dm-1' })
    );

    const values = result.current.form.getValues();
    expect(values.cacheLifetime).toBe(600);
    expect(values.columnConfig).toEqual(['col_a', 'col_b']);
    expect(values.filterConfig).toHaveLength(2);
    expect(values.filterConfig?.[1]).toEqual(preJoinRule);
    expect(values.sortConfig).toEqual([{ column: 'col_a', direction: 'desc' }]);
    expect(values.limitConfig).toBe(1000);
  });

  it('falls back to defaults when initialReport is omitted', () => {
    const { result } = renderHook(() => useLookerStudioReportForm({ dataMartId: 'dm-1' }));
    const values = result.current.form.getValues();
    expect(values.cacheLifetime).toBe(300);
    expect(values.filterConfig).toBeNull();
    expect(values.sortConfig).toBeNull();
    expect(values.limitConfig).toBeNull();
  });
});

describe('useLookerStudioReportForm — submission', () => {
  it('UPDATE path: forwards output controls including pre-join rule', async () => {
    const preJoinRule: FilterRule = {
      column: 'country',
      operator: 'neq',
      value: 'UA',
      placement: 'pre-join',
      aliasPath: 'users',
    };
    const initial = buildReport({ id: 'r-42' });
    const { result } = renderHook(() =>
      useLookerStudioReportForm({ initialReport: initial, dataMartId: 'dm-1' })
    );

    act(() => {
      result.current.form.setValue('filterConfig', [preJoinRule]);
      result.current.form.setValue('sortConfig', [{ column: 'col_a', direction: 'asc' }]);
      result.current.form.setValue('limitConfig', 250);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    expect(mockUpdateReport).toHaveBeenCalledTimes(1);
    const [reportId, payload] = mockUpdateReport.mock.calls[0];
    expect(reportId).toBe('r-42');
    expect(payload).toMatchObject({
      destinationConfig: {
        type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG,
        cacheLifetime: 600,
      },
      filterConfig: [preJoinRule],
      sortConfig: [{ column: 'col_a', direction: 'asc' }],
      limitConfig: 250,
    });
  });

  it('UPDATE: spreads ownerIds only when pendingOwnerIdsRef.current is non-null', async () => {
    const ownerRef = { current: ['u-1'] };
    const { result } = renderHook(() =>
      useLookerStudioReportForm({
        initialReport: buildReport(),
        dataMartId: 'dm-1',
        pendingOwnerIdsRef: ownerRef,
      })
    );

    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    expect(mockUpdateReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ ownerIds: ['u-1'] })
    );
  });
});
