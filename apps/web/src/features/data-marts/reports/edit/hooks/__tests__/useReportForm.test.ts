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
import { useReportForm, ReportEditFormSchema, buildReportEditFormSchema } from '../useReportForm';
import { DataDestinationType } from '../../../../../data-destination/shared/enums';
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

const validGoogleSheetsFormData = {
  title: 'Test Report',
  documentUrl: VALID_SHEETS_URL,
  dataDestinationId: 'dest-1',
  columnConfig: ['col_a'],
  filterConfig: null,
  sortConfig: null,
  limitConfig: null,
  aggregationConfig: null,
  dateTruncConfig: null,
  uniqueCountConfig: [],
};

describe('ReportEditFormSchema — columnConfig validation', () => {
  it('rejects an empty array with the expected message', async () => {
    const result = await ReportEditFormSchema.safeParseAsync({
      ...validGoogleSheetsFormData,
      columnConfig: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('columnConfig'))?.message;
      expect(msg).toBe('At least one column must be selected');
    }
  });

  it('accepts null (no columns configured yet)', async () => {
    const result = await ReportEditFormSchema.safeParseAsync({
      ...validGoogleSheetsFormData,
      columnConfig: null,
    });

    expect(result.success).toBe(true);
  });

  it('validates aggregation and date-trunc configs', async () => {
    const result = await ReportEditFormSchema.safeParseAsync({
      ...validGoogleSheetsFormData,
      aggregationConfig: [{ column: 'revenue', function: 'P95' }],
      dateTruncConfig: [{ column: 'ordered_at', unit: 'MONTH' }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown aggregation function', async () => {
    const result = await ReportEditFormSchema.safeParseAsync({
      ...validGoogleSheetsFormData,
      aggregationConfig: [{ column: 'revenue', function: 'MEDIAN' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown date-trunc unit', async () => {
    const result = await ReportEditFormSchema.safeParseAsync({
      ...validGoogleSheetsFormData,
      dateTruncConfig: [{ column: 'ordered_at', unit: 'HOUR' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('useReportForm — defaults', () => {
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
      useReportForm({
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
      useReportForm({
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

describe('useReportForm — submission', () => {
  it('CREATE: passes all output controls (including pre-join rule) to createReport', async () => {
    const preJoinRule: FilterRule = {
      column: 'users__country',
      operator: 'neq',
      value: 'UA',
      placement: 'pre-join',
    };

    const { result } = renderHook(() =>
      useReportForm({
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
      result.current.form.setValue('aggregationConfig', [{ column: 'revenue', function: 'SUM' }]);
      result.current.form.setValue('dateTruncConfig', [{ column: 'event_id', unit: 'DAY' }]);
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
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        dateTruncConfig: [{ column: 'event_id', unit: 'DAY' }],
      })
    );
  });

  it('UPDATE: forwards output controls to updateReport with the initial report id', async () => {
    const initial = buildReport({ id: 'r-42' });
    const { result } = renderHook(() =>
      useReportForm({
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
      useReportForm({
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
      useReportForm({
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

  it('CREATE: saves an Excel report with the Excel config, which names no document', async () => {
    const { result } = renderHook(() =>
      useReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
        destinationType: DataDestinationType.EXCEL,
      })
    );

    act(() => {
      result.current.form.setValue('title', 'From the add-in');
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('columnConfig', ['event_id']);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    expect(mockCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationConfig: { type: DestinationTypeConfigEnum.EXCEL_CONFIG },
      })
    );
  });

  it('refuses a destination this form does not serve instead of saving it as Excel', async () => {
    // Email names no document either, so a predicate-driven fallback would have saved this as an
    // Excel report — silently, and with no error anywhere.
    const { result } = renderHook(() =>
      useReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
        destinationType: DataDestinationType.EMAIL,
      })
    );

    act(() => {
      result.current.form.setValue('title', 'Wrong form');
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('columnConfig', ['event_id']);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    expect(mockCreateReport).not.toHaveBeenCalled();
    expect(result.current.formError).toMatch(/cannot configure/);
  });
});

describe('useReportForm — uniqueCountConfig round-trip', () => {
  it('initializes uniqueCountConfig from a saved report', () => {
    const initial = buildReport({ uniqueCountConfig: ['', 'orders'] } as Partial<DataMartReport>);
    const { result } = renderHook(() =>
      useReportForm({
        initialReport: initial,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );
    expect(result.current.getValues().uniqueCountConfig).toEqual(['', 'orders']);
  });

  it('falls back to an empty list when initialReport.uniqueCountConfig is absent', () => {
    const initial = buildReport();
    const { result } = renderHook(() =>
      useReportForm({
        initialReport: initial,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );
    expect(result.current.getValues().uniqueCountConfig).toEqual([]);
  });

  it('CREATE: includes uniqueCountConfig in createReport payload', async () => {
    const { result } = renderHook(() =>
      useReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
      })
    );

    act(() => {
      result.current.form.setValue('title', 'X');
      result.current.form.setValue('documentUrl', VALID_SHEETS_URL);
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('columnConfig', ['col_a']);
      result.current.form.setValue('uniqueCountConfig', ['', 'orders']);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.getValues());
    });

    expect(mockCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueCountConfig: ['', 'orders'] })
    );
  });
});

describe('buildReportEditFormSchema', () => {
  const values = {
    title: 'X',
    documentUrl: '',
    dataDestinationId: 'dest-1',
    columnConfig: ['col_a'],
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    aggregationConfig: null,
    dateTruncConfig: null,
    uniqueCountConfig: [],
  };

  it('demands a document URL where the report stores one', () => {
    const result = buildReportEditFormSchema(DataDestinationType.GOOGLE_SHEETS).safeParse(values);

    expect(result.success).toBe(false);
  });

  it('asks for none where the report names no document', () => {
    // Validating a field the form never showed would block saving an Excel report on a rule
    // about a URL nobody can supply.
    const result = buildReportEditFormSchema(DataDestinationType.EXCEL).safeParse(values);

    expect(result.success).toBe(true);
  });
});
