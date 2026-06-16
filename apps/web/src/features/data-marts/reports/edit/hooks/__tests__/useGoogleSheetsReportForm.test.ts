import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';

// ---- module-level mocks (must come before any module imports) ----

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
import { useGoogleSheetsReportForm } from '../useGoogleSheetsReportForm';
import { ReportFormMode } from '../../../shared';
import { DestinationTypeConfigEnum } from '../../../shared/enums/destination-type-config.enum';
import { DataStorageType } from '../../../../../data-storage/shared/model/types/data-storage-type.enum';
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

const VALID_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0';

function buildReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'report-1',
    title: 'My Report',
    dataMart: {
      id: 'dm-1',
      definitionType: null,
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    },
    dataDestination: {
      id: 'dest-1',
      type: 'google-sheets',
      title: 'Sheets',
    } as unknown as DataMartReport['dataDestination'],
    destinationConfig: {
      type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
      spreadsheetId: 'abc123',
      sheetId: '0',
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

describe('useGoogleSheetsReportForm — defaults', () => {
  it('seeds defaults from initialReport (title, columnConfig, all output controls)', () => {
    const preJoinRule: FilterRule = {
      column: 'users__userRole',
      operator: 'eq',
      value: 'admin',
      placement: 'pre-join',
    };
    const postJoinRule: FilterRule = { column: 'revenue', operator: 'gt', value: 100 };

    const initialReport = buildReport({
      title: 'Quarterly export',
      columnConfig: ['event_id', 'user_id'],
      filterConfig: [postJoinRule, preJoinRule],
      sortConfig: [{ column: 'event_id', direction: 'asc' }],
      limitConfig: 500,
    });

    const { result } = renderHook(() =>
      useGoogleSheetsReportForm({
        initialReport,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );

    const values = result.current.getValues();
    expect(values.title).toBe('Quarterly export');
    expect(values.columnConfig).toEqual(['event_id', 'user_id']);
    expect(values.filterConfig).toEqual([postJoinRule, preJoinRule]);
    expect(values.sortConfig).toEqual([{ column: 'event_id', direction: 'asc' }]);
    expect(values.limitConfig).toBe(500);
  });

  it('falls back to nulls when initialReport has no output controls', () => {
    const { result } = renderHook(() =>
      useGoogleSheetsReportForm({
        initialReport: buildReport(),
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );
    const values = result.current.getValues();
    expect(values.filterConfig).toBeNull();
    expect(values.sortConfig).toBeNull();
    expect(values.limitConfig).toBeNull();
  });
});

describe('useGoogleSheetsReportForm — submission', () => {
  it('CREATE: passes all output controls (including pre-join rule) to createReport', async () => {
    const preJoinRule: FilterRule = {
      column: 'users__country',
      operator: 'neq',
      value: 'UA',
      placement: 'pre-join',
    };

    const { result } = renderHook(() =>
      useGoogleSheetsReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
      })
    );

    act(() => {
      result.current.form.setValue('title', 'New');
      result.current.form.setValue('documentUrl', VALID_SHEETS_URL);
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('columnConfig', ['event_id']);
      result.current.form.setValue('filterConfig', [preJoinRule]);
      result.current.form.setValue('sortConfig', [{ column: 'event_id', direction: 'desc' }]);
      result.current.form.setValue('limitConfig', 100);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    expect(mockCreateReport).toHaveBeenCalledTimes(1);
    expect(mockCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New',
        dataMartId: 'dm-1',
        dataDestinationId: 'dest-1',
        destinationConfig: {
          type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
          spreadsheetId: 'abc123',
          sheetId: 0, // extractGoogleSheetsUrlComponents returns number
        },
        columnConfig: ['event_id'],
        filterConfig: [preJoinRule],
        sortConfig: [{ column: 'event_id', direction: 'desc' }],
        limitConfig: 100,
      })
    );
  });

  it('UPDATE: forwards output controls to updateReport with the initial report id', async () => {
    const initial = buildReport({ id: 'r-42' });
    const { result } = renderHook(() =>
      useGoogleSheetsReportForm({
        initialReport: initial,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );

    act(() => {
      result.current.form.setValue('documentUrl', VALID_SHEETS_URL);
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('limitConfig', 250);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    expect(mockUpdateReport).toHaveBeenCalledTimes(1);
    const [reportId, payload] = mockUpdateReport.mock.calls[0];
    expect(reportId).toBe('r-42');
    expect(payload).toMatchObject({ limitConfig: 250 });
  });

  it('CREATE: adds ownerIds only when pendingOwnerIdsRef.current is non-null', async () => {
    const ownerRef = { current: ['user-1', 'user-2'] };
    const { result } = renderHook(() =>
      useGoogleSheetsReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
        pendingOwnerIdsRef: ownerRef,
      })
    );

    act(() => {
      result.current.form.setValue('title', 'X');
      result.current.form.setValue('documentUrl', VALID_SHEETS_URL);
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('columnConfig', ['col_a']);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    expect(mockCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIds: ['user-1', 'user-2'] })
    );
  });

  it('CREATE: omits ownerIds when pendingOwnerIdsRef.current is null', async () => {
    const ownerRef: { current: string[] | null } = { current: null };
    const { result } = renderHook(() =>
      useGoogleSheetsReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
        pendingOwnerIdsRef: ownerRef,
      })
    );

    act(() => {
      result.current.form.setValue('title', 'X');
      result.current.form.setValue('documentUrl', VALID_SHEETS_URL);
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('columnConfig', ['col_a']);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    const payload = mockCreateReport.mock.calls[0][0];
    expect('ownerIds' in payload).toBe(false);
  });
});
