import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDestinationType } from '../../../features/data-destination';
import { DataDestinationCredentialsType } from '../../../features/data-destination/shared/enums/data-destination-credentials-type.enum';
import { DataStorageType } from '../../../features/data-storage/shared';
import { DataMartStatus, DataMartDefinitionType } from '../../../features/data-marts/shared';
import {
  DestinationTypeConfigEnum,
  ReportStatusEnum,
  TemplateSourceTypeEnum,
} from '../../../features/data-marts/reports/shared/enums';
import { ReportConditionEnum } from '../../../features/data-marts/reports/shared/enums/report-condition.enum';
import type { ReportResponseDto } from '../../../features/data-marts/reports/shared/services';
import { reportService } from '../../../features/data-marts/reports/shared/services';
import { mapReportDtoToEntity } from '../../../features/data-marts/reports/shared/model/mappers';
import DataMartReportsPage from './DataMartReportsPage';
import { mergeReportPagePreservingRows } from './DataMartReportsPage.utils';

const mockToastCustom = vi.hoisted(() => vi.fn().mockReturnValue('mock-toast-id'));
vi.mock('react-hot-toast', () => ({
  default: { custom: mockToastCustom, dismiss: vi.fn(), success: vi.fn(), error: vi.fn() },
  toast: { custom: mockToastCustom, dismiss: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const reportServiceMock = vi.hoisted(() => ({
  getReportsByProject: vi.fn(),
  getReportsByDataMartId: vi.fn(),
  getReportById: vi.fn(),
  runReport: vi.fn(),
  deleteReport: vi.fn(),
  getGeneratedSql: vi.fn(),
  copyAsDataMart: vi.fn(),
}));

const reportStatusPollingServiceMock = vi.hoisted(() => ({
  setConfig: vi.fn(),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
  stopAllPolling: vi.fn(),
}));

vi.mock('../../../features/data-marts/reports/shared/services', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../features/data-marts/reports/shared/services')>();
  return {
    ...actual,
    reportService: reportServiceMock,
    reportStatusPollingService: reportStatusPollingServiceMock,
  };
});

vi.mock('../../../components/AppSidebar/SetupChecklist/useSetupProgress', () => ({
  useRefreshSetupProgress: () => vi.fn(),
}));

vi.mock(
  '../../../features/data-marts/reports/list/components/DestinationCard/ReportEditSheetRenderer',
  async () => {
    const { useDataMartContext } = await import('../../../features/data-marts/edit/model');
    const { useReportContext } =
      await import('../../../features/data-marts/reports/shared/model/context');

    return {
      ReportEditSheetRenderer: ({
        isOpen,
        initialReport,
        onClose,
        onSubmitSuccess,
      }: {
        isOpen: boolean;
        initialReport?: { title: string } | null;
        onClose: () => void;
        onSubmitSuccess?: () => void | Promise<void>;
      }) => {
        const { dataMart } = useDataMartContext();
        useReportContext();

        return isOpen ? (
          <div role='dialog' aria-label='Report edit sheet'>
            Editing report {initialReport?.title} for {dataMart?.title} via {dataMart?.storage.type}
            <button type='button' onClick={onClose}>
              Close report edit sheet
            </button>
            <button
              type='button'
              onClick={() => {
                void onSubmitSuccess?.();
                onClose();
              }}
            >
              Submit report edit sheet
            </button>
          </div>
        ) : null;
      },
    };
  }
);

vi.mock('../../../features/idp', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: {
      id: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
    },
  }),
}));

describe('DataMartReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    reportServiceMock.getReportsByDataMartId.mockResolvedValue([]);
    reportServiceMock.getReportById.mockResolvedValue(buildReportResponse());
    reportServiceMock.runReport.mockResolvedValue(undefined);
    reportServiceMock.deleteReport.mockResolvedValue(undefined);
    reportServiceMock.getGeneratedSql.mockResolvedValue({ sql: 'select 1' });
    reportServiceMock.copyAsDataMart.mockResolvedValue({ dataMartId: 'dm-copy' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves unchanged report row objects during silent page refreshes', () => {
    const unchangedReport = mapReportDtoToEntity(
      buildReportResponse({ id: 'report-1', title: 'Unchanged Report' })
    );
    const changedReport = mapReportDtoToEntity(
      buildReportResponse({ id: 'report-2', title: 'Pending Report' })
    );
    const oldTailReport = mapReportDtoToEntity(
      buildReportResponse({ id: 'report-3', title: 'Loaded Tail Report' })
    );
    const nextUnchangedReport = mapReportDtoToEntity(
      buildReportResponse({ id: 'report-1', title: 'Unchanged Report' })
    );
    const nextChangedReport = mapReportDtoToEntity(
      buildReportResponse({
        id: 'report-2',
        title: 'Pending Report',
        lastRunStatus: ReportStatusEnum.RUNNING,
      })
    );

    const mergedReports = mergeReportPagePreservingRows(
      [unchangedReport, changedReport, oldTailReport],
      [nextUnchangedReport, nextChangedReport]
    );

    expect(mergedReports[0]).toBe(unchangedReport);
    expect(mergedReports[1]).toBe(nextChangedReport);
    expect(mergedReports[2]).toBe(oldTailReport);
  });

  it('loads all project reports and shows their Data Mart context', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([buildReportResponse()]);

    renderPage();

    expect(await screen.findByText('Reports')).toBeInTheDocument();
    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marketing Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/dm-1/reports'
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Success' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle columns' })).toBeInTheDocument();
    expect(reportService.getReportsByProject).toHaveBeenCalledWith();
  });

  it('uses table pagination over the full reports list', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce(
      Array.from({ length: 16 }, (_, index) =>
        buildReportResponse({
          id: `report-${index + 1}`,
          title: `Report ${index + 1}`,
        })
      )
    );

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();
    expect(screen.getByText('1–15 of 16 rows')).toBeInTheDocument();
    expect(screen.queryByText('Report 16')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(await screen.findByText('Report 16')).toBeInTheDocument();
    expect(screen.getByText('16–16 of 16 rows')).toBeInTheDocument();
  });

  it('shows Data Mart as the first table column', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([buildReportResponse()]);

    renderPage();

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(getColumnHeaderLabels().slice(0, 2)).toEqual(['Data Mart', 'Report']);
  });

  it('renders the Data Mart title without truncation so long titles can wrap', async () => {
    const longDataMartTitle = 'Marketing Campaign Performance Data Mart With Long Title';
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({ dataMartTitle: longDataMartTitle }),
    ]);

    renderPage();

    const dataMartLink = await screen.findByRole('link', { name: longDataMartTitle });
    expect(dataMartLink).toHaveClass('block', 'w-full', 'whitespace-normal', 'break-words');
    expect(dataMartLink).not.toHaveClass('truncate');
  });

  it('shows a Data Mart-focused empty state when there are no project-wide reports', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'No reports yet' })).toBeInTheDocument();
    expect(
      screen.getByText(/Reports configured inside Data Marts will appear here/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a Data Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts'
    );
    expect(screen.queryByRole('button', { name: 'Toggle columns' })).not.toBeInTheDocument();
  });

  it('shows a muted dash when a report has no title', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({
        title: '',
      }),
    ]);

    renderPage();

    const emptyTitleFallback = await screen.findByText('—');
    expect(emptyTitleFallback).toHaveClass('text-muted-foreground');
  });

  it('shows a muted long dash when a report has no run status', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({
        lastRunAt: null,
        lastRunStatus: null,
      }),
    ]);

    renderPage();

    const runStatusFallback = await screen.findByText('—');
    expect(runStatusFallback).toHaveClass('text-muted-foreground');
  });

  it('renders Data Marts list-style card controls and applies Data Mart URL filters', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse(),
      buildReportResponse({
        id: 'report-2',
        title: 'Product Report',
        dataMartTitle: 'Product Mart',
      }),
    ]);

    const { container } = renderPage(buildFilterPath('data-marts/reports', 'Marketing Mart'));

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.queryByText('Product Report')).not.toBeInTheDocument();
    expect(container.querySelector('.dm-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument();
  });

  it('searches reports by the Data Mart column', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse(),
      buildReportResponse({
        id: 'report-2',
        title: 'Product Report',
        dataMartTitle: 'Product Mart',
      }),
    ]);

    renderPage();

    expect(await screen.findByText('Product Report')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Marketing' },
    });

    expect(screen.getByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.queryByText('Product Report')).not.toBeInTheDocument();
  });

  it('searches reports by the Report column', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({
        title: 'Daily Sales Report',
        dataMartTitle: 'Marketing Mart',
      }),
      buildReportResponse({
        id: 'report-2',
        title: 'Inventory Variance',
        dataMartTitle: 'Warehouse Mart',
      }),
    ]);

    renderPage();

    expect(await screen.findByText('Inventory Variance')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Inventory' },
    });

    expect(screen.getByText('Inventory Variance')).toBeInTheDocument();
    expect(screen.queryByText('Daily Sales Report')).not.toBeInTheDocument();
  });

  it('opens the report edit sheet when a report row is clicked', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([buildReportResponse()]);

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));

    expect(screen.getByRole('dialog', { name: 'Report edit sheet' })).toHaveTextContent(
      'Editing report Daily Sales Report for Marketing Mart via GOOGLE_BIGQUERY'
    );
  });

  it('closes the report edit sheet without reloading the project reports list', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([buildReportResponse()]);

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));
    fireEvent.click(screen.getByRole('button', { name: 'Close report edit sheet' }));

    expect(screen.queryByRole('dialog', { name: 'Report edit sheet' })).not.toBeInTheDocument();
    expect(reportService.getReportsByProject).toHaveBeenCalledTimes(1);
  });

  it('reloads the project reports list after a report edit submit succeeds', async () => {
    vi.mocked(reportService.getReportsByProject)
      .mockResolvedValueOnce([buildReportResponse()])
      .mockResolvedValueOnce([
        buildReportResponse({
          title: 'Updated Daily Sales Report',
        }),
      ]);

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit report edit sheet' }));

    await waitFor(() => {
      expect(reportService.getReportsByProject).toHaveBeenCalledTimes(2);
    });
  });

  it('does not open the report edit sheet when the caller cannot edit report config', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({ canEditConfig: false }),
    ]);

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));

    expect(screen.queryByRole('dialog', { name: 'Report edit sheet' })).not.toBeInTheDocument();
  });

  it('renders report row actions like the Data Mart reports tab', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildGoogleSheetsReportResponse({
        title: 'Blended Sheet Report',
        columnConfig: ['joined_field'],
      }),
    ]);
    const { container } = renderPage();

    expect(await screen.findByText('Blended Sheet Report')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Run report: Blended Sheet Report' })
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        'a[href="https://docs.google.com/spreadsheets/d/spreadsheet-1/edit#gid=123"]'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Preview SQL: Blended Sheet Report' })
    ).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: 'Actions for report: Blended Sheet Report',
      }),
      {
        button: 0,
        ctrlKey: false,
      }
    );

    expect(await screen.findByText('Edit report')).toBeInTheDocument();
    expect(screen.getByText('Delete report')).toBeInTheDocument();
  });

  it('does not open the report edit sheet when Open document is clicked', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildGoogleSheetsReportResponse({
        title: 'Blended Sheet Report',
        columnConfig: ['joined_field'],
      }),
    ]);

    const { container } = renderPage();

    await screen.findByText('Blended Sheet Report');

    fireEvent.click(
      container.querySelector(
        'a[href="https://docs.google.com/spreadsheets/d/spreadsheet-1/edit#gid=123"]'
      )!
    );

    expect(screen.queryByRole('dialog', { name: 'Report edit sheet' })).not.toBeInTheDocument();
  });

  it('does not open the report edit sheet when Preview SQL is clicked', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildGoogleSheetsReportResponse({
        title: 'Blended Sheet Report',
        columnConfig: ['joined_field'],
      }),
    ]);

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Preview SQL: Blended Sheet Report',
      })
    );

    expect(screen.queryByRole('dialog', { name: 'Report edit sheet' })).not.toBeInTheDocument();
  });

  it('renders notification report row actions like the Data Mart reports tab', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({
        title: 'Slack Alert',
        destinationTitle: 'Slack workspace',
        destinationType: DataDestinationType.SLACK,
      }),
    ]);

    renderPage();

    expect(await screen.findByText('Slack Alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run report: Slack Alert' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actions for report: Slack Alert' })
    ).toBeInTheDocument();
  });

  it('runs a report from the project-wide reports action cell', async () => {
    vi.mocked(reportService.getReportsByProject)
      .mockResolvedValueOnce([
        buildGoogleSheetsReportResponse({
          title: 'Blended Sheet Report',
        }),
      ])
      .mockResolvedValueOnce([
        buildGoogleSheetsReportResponse({
          title: 'Blended Sheet Report',
          lastRunStatus: ReportStatusEnum.RUNNING,
        }),
      ]);

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Run report: Blended Sheet Report' })
    );

    // The component uses a grace-period toast; invoke onConfirm to trigger the actual run
    await waitFor(() => {
      expect(mockToastCustom).toHaveBeenCalled();
    });
    const renderFn = mockToastCustom.mock.calls[0][0] as (t: { id: string }) => ReactElement;
    const element = renderFn({ id: 'mock-toast-id' });
    const { onConfirm } = element.props as { onConfirm: () => Promise<void> };

    await act(async () => {
      await onConfirm();
    });

    await waitFor(() => {
      expect(reportService.runReport).toHaveBeenCalledWith('report-1');
    });
    await waitFor(() => {
      expect(reportService.getReportsByProject).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps report run actions disabled when the caller cannot run reports', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildGoogleSheetsReportResponse({
        title: 'Restricted Sheet Report',
        canRun: false,
      }),
    ]);

    renderPage();

    const runButton = await screen.findByRole('button', {
      name: 'Run report: Restricted Sheet Report',
    });
    expect(runButton).toBeDisabled();

    fireEvent.click(runButton);

    expect(reportService.runReport).not.toHaveBeenCalled();
  });

  it('polls visible running reports by id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({
        lastRunStatus: ReportStatusEnum.RUNNING,
      }),
    ]);

    renderPage();

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(reportService.getReportById).toHaveBeenCalledWith('report-1');
    });
    expect(reportService.getReportsByProject).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not poll project reports when a running report is outside the visible page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(reportService.getReportsByProject).mockResolvedValue(
      Array.from({ length: 16 }, (_, index) =>
        buildReportResponse({
          id: `report-${index + 1}`,
          title: `Report ${index + 1}`,
          lastRunStatus: index === 15 ? ReportStatusEnum.RUNNING : ReportStatusEnum.SUCCESS,
        })
      )
    );

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);

    expect(reportService.getReportsByProject).toHaveBeenCalledTimes(1);
    expect(reportService.getReportById).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('stops polling after a visible running report finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      buildReportResponse({
        lastRunStatus: ReportStatusEnum.RUNNING,
      }),
    ]);
    vi.mocked(reportService.getReportById).mockResolvedValueOnce(
      buildReportResponse({
        lastRunStatus: ReportStatusEnum.SUCCESS,
      })
    );

    renderPage();

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'In progress' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(reportService.getReportById).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('img', { name: 'Success' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);

    expect(reportService.getReportById).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('keeps already loaded report pages during silent polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce(
      Array.from({ length: 16 }, (_, index) =>
        buildReportResponse({
          id: `report-${index + 1}`,
          title: `Report ${index + 1}`,
          lastRunStatus: index === 0 ? ReportStatusEnum.RUNNING : ReportStatusEnum.SUCCESS,
        })
      )
    );
    vi.mocked(reportService.getReportById).mockResolvedValueOnce(
      buildReportResponse({
        id: 'report-1',
        title: 'Report 1',
        lastRunStatus: ReportStatusEnum.RUNNING,
      })
    );

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Report 16' },
    });
    expect(await screen.findByText('Report 16')).toBeInTheDocument();
    expect(reportService.getReportsByProject).toHaveBeenCalledWith();
    expect(reportService.getReportsByProject).toHaveBeenCalledTimes(1);
    expect(reportService.getReportById).toHaveBeenCalledWith('report-1');

    vi.useRealTimers();
  });

  it('refreshes visible running reports by id when they are outside the first API page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce(
      Array.from({ length: 105 }, (_, index) =>
        buildReportResponse({
          id: `report-${index + 1}`,
          title: index === 104 ? 'Tail Running Report' : `Report ${index + 1}`,
          lastRunStatus: index === 104 ? ReportStatusEnum.RUNNING : ReportStatusEnum.SUCCESS,
        })
      )
    );
    vi.mocked(reportService.getReportById).mockResolvedValueOnce(
      buildReportResponse({
        id: 'report-105',
        title: 'Tail Running Report',
        lastRunStatus: ReportStatusEnum.SUCCESS,
      })
    );

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Tail' },
    });

    expect(await screen.findByText('Tail Running Report')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'In progress' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(reportService.getReportById).toHaveBeenCalledWith('report-105');
    });
    expect(reportService.getReportsByProject).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('img', { name: 'Success' })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('searches across the full loaded reports list without fetching another page', async () => {
    vi.mocked(reportService.getReportsByProject).mockResolvedValueOnce([
      ...Array.from({ length: 15 }, (_, index) =>
        buildReportResponse({
          id: `report-${index + 1}`,
          title: `Report ${index + 1}`,
        })
      ),
      buildReportResponse({
        id: 'report-needle',
        title: 'Needle Report',
      }),
    ]);

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Needle' },
    });

    expect(await screen.findByText('Needle Report')).toBeInTheDocument();
    expect(reportService.getReportsByProject).toHaveBeenCalledTimes(1);
  });
});

function renderPage(path = '/ui/project-1/data-marts/reports') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataMartReportsPage />
    </MemoryRouter>
  );
}

function buildFilterPath(path: string, dataMartTitle: string) {
  const filters = encodeURIComponent(
    JSON.stringify([{ f: 'dataMart', o: 'eq', v: [dataMartTitle] }])
  );
  return `/ui/project-1/${path}?filters=${filters}`;
}

function getColumnHeaderLabels() {
  return screen
    .getAllByRole('columnheader')
    .map(header => header.textContent.trim())
    .filter((label): label is string => Boolean(label));
}

function buildReportResponse(overrides: ReportFixtureOverrides = {}): ReportResponseDto {
  return {
    id: overrides.id ?? 'report-1',
    title: overrides.title ?? 'Daily Sales Report',
    dataMart: {
      id: 'dm-1',
      title: overrides.dataMartTitle ?? 'Marketing Mart',
      status: DataMartStatus.PUBLISHED,
      storage: buildDataStorageResponse(),
      definitionType: DataMartDefinitionType.SQL,
      definition: null,
      description: null,
      triggersCount: 0,
      reportsCount: 1,
      createdByUser: null,
      businessOwnerUsers: [],
      technicalOwnerUsers: [],
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      schema: null,
    },
    dataDestinationAccess: {
      id: 'dest-1',
      title: overrides.destinationTitle ?? 'Email',
      type: overrides.destinationType ?? DataDestinationType.EMAIL,
      projectId: 'project-1',
      credentials: {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: ['daily@example.com'],
      },
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    destinationConfig: {
      type: DestinationTypeConfigEnum.EMAIL_CONFIG,
      reportCondition: ReportConditionEnum.ALWAYS,
      subject: 'Daily Sales',
      templateSource: {
        type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
        config: {
          messageTemplate: 'Daily report',
        },
      },
    },
    columnConfig: overrides.columnConfig ?? null,
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    lastRunAt: overrides.lastRunAt === undefined ? '2026-06-05T12:00:00.000Z' : overrides.lastRunAt,
    lastRunStatus:
      overrides.lastRunStatus === undefined ? ReportStatusEnum.SUCCESS : overrides.lastRunStatus,
    lastRunError: null,
    runsCount: 3,
    createdAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-05T12:00:00.000Z',
    createdByUser: null,
    ownerUsers: [],
    canRun: overrides.canRun ?? true,
    canManageTriggers: overrides.canManageTriggers ?? true,
    canEditConfig: overrides.canEditConfig ?? true,
  };
}

function buildGoogleSheetsReportResponse(
  overrides: ReportFixtureOverrides = {}
): ReportResponseDto {
  return {
    ...buildReportResponse(overrides),
    dataDestinationAccess: {
      id: 'dest-sheets-1',
      title: 'Google Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      projectId: 'project-1',
      credentials: {
        type: DataDestinationCredentialsType.GOOGLE_SHEETS_CREDENTIALS,
        serviceAccountKey: {},
      },
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    destinationConfig: {
      type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
      spreadsheetId: 'spreadsheet-1',
      sheetId: 123,
    },
  };
}

interface ReportFixtureOverrides extends Partial<
  Pick<ReportResponseDto, 'id' | 'title' | 'lastRunAt' | 'lastRunStatus'>
> {
  dataMartTitle?: string;
  destinationTitle?: string;
  destinationType?: DataDestinationType;
  columnConfig?: ReportResponseDto['columnConfig'];
  canRun?: boolean;
  canManageTriggers?: boolean;
  canEditConfig?: boolean;
}

function buildDataStorageResponse(): ReportResponseDto['dataMart']['storage'] {
  return {
    id: 'storage-1',
    title: 'BigQuery Storage',
    type: DataStorageType.GOOGLE_BIGQUERY,
    credentials: null,
    config: {
      projectId: 'test-project',
      location: 'US',
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-01T00:00:00.000Z',
    publishedDataMartsCount: 1,
    draftDataMartsCount: 0,
  };
}
