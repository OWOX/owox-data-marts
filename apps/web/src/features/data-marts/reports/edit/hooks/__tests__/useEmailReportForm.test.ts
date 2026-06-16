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
import { useEmailReportForm } from '../useEmailReportForm';
import { ReportFormMode, TemplateSourceTypeEnum } from '../../../shared';
import { DestinationTypeConfigEnum } from '../../../shared/enums/destination-type-config.enum';
import { ReportConditionEnum } from '../../../shared/enums/report-condition.enum';
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

function buildReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'report-1',
    title: 'Email Report',
    dataMart: {
      id: 'dm-1',
      definitionType: null,
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    },
    dataDestination: {
      id: 'dest-1',
      type: 'email',
      title: 'Email',
    } as unknown as DataMartReport['dataDestination'],
    destinationConfig: {
      type: DestinationTypeConfigEnum.EMAIL_CONFIG,
      reportCondition: ReportConditionEnum.ALWAYS,
      subject: 'Weekly',
      templateSource: {
        type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
        config: { messageTemplate: 'Hello' },
      },
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

describe('useEmailReportForm — defaults', () => {
  it('seeds output controls from initialReport (post+pre-join mix)', () => {
    const preJoinRule: FilterRule = {
      column: 'orgs__plan',
      operator: 'eq',
      value: 'pro',
      placement: 'pre-join',
    };
    const initial = buildReport({
      filterConfig: [{ column: 'col_a', operator: 'eq', value: 'X' }, preJoinRule],
      sortConfig: [{ column: 'col_a', direction: 'desc' }],
      limitConfig: 99,
    });

    const { result } = renderHook(() =>
      useEmailReportForm({
        initialReport: initial,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );

    const values = result.current.form.getValues();
    expect(values.title).toBe('Email Report');
    expect(values.filterConfig).toHaveLength(2);
    expect(values.filterConfig?.[1]).toEqual(preJoinRule);
    expect(values.sortConfig).toEqual([{ column: 'col_a', direction: 'desc' }]);
    expect(values.limitConfig).toBe(99);
  });
});

describe('useEmailReportForm — submission', () => {
  it('UPDATE: builds CUSTOM_MESSAGE destinationConfig and forwards output controls', async () => {
    const initial = buildReport({ id: 'r-42' });
    const preJoinRule: FilterRule = {
      column: 'users__country',
      operator: 'neq',
      value: 'UA',
      placement: 'pre-join',
    };

    const { result } = renderHook(() =>
      useEmailReportForm({
        initialReport: initial,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );

    act(() => {
      result.current.form.setValue('subject', 'Updated subject');
      result.current.form.setValue('messageTemplate', 'New body');
      result.current.form.setValue('filterConfig', [preJoinRule]);
      result.current.form.setValue('limitConfig', 50);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    expect(mockUpdateReport).toHaveBeenCalledTimes(1);
    const [reportId, payload] = mockUpdateReport.mock.calls[0];
    expect(reportId).toBe('r-42');
    expect(payload.destinationConfig).toMatchObject({
      type: DestinationTypeConfigEnum.EMAIL_CONFIG,
      reportCondition: ReportConditionEnum.ALWAYS,
      subject: 'Updated subject',
      templateSource: {
        type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
        config: { messageTemplate: 'New body' },
      },
    });
    expect(payload.filterConfig).toEqual([preJoinRule]);
    expect(payload.limitConfig).toBe(50);
  });

  it('UPDATE: builds INSIGHT_TEMPLATE destinationConfig when templateSourceType=INSIGHT_TEMPLATE', async () => {
    const initial = buildReport({ id: 'r-50' });
    const { result } = renderHook(() =>
      useEmailReportForm({
        initialReport: initial,
        mode: ReportFormMode.EDIT,
        dataMartId: 'dm-1',
      })
    );

    act(() => {
      result.current.form.setValue('templateSourceType', TemplateSourceTypeEnum.INSIGHT_TEMPLATE);
      result.current.form.setValue('insightTemplateId', 'tmpl-7');
    });

    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    const payload = mockUpdateReport.mock.calls[0][1];
    expect(payload.destinationConfig.templateSource).toEqual({
      type: TemplateSourceTypeEnum.INSIGHT_TEMPLATE,
      config: { insightTemplateId: 'tmpl-7' },
    });
  });

  it('CREATE: adds ownerIds only when pendingOwnerIdsRef.current is non-null', async () => {
    const ownerRef = { current: ['user-7'] };
    const { result } = renderHook(() =>
      useEmailReportForm({
        mode: ReportFormMode.CREATE,
        dataMartId: 'dm-1',
        pendingOwnerIdsRef: ownerRef,
      })
    );

    act(() => {
      result.current.form.setValue('title', 'T');
      result.current.form.setValue('dataDestinationId', 'dest-1');
      result.current.form.setValue('subject', 'S');
      result.current.form.setValue('messageTemplate', 'M');
      result.current.form.setValue('columnConfig', ['col_a']);
    });

    await act(async () => {
      await result.current.onSubmit(result.current.form.getValues());
    });

    expect(mockCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIds: ['user-7'] })
    );
  });
});
