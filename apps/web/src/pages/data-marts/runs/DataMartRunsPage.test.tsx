import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DataQualityCompactSummary,
  DataMartRunStatus,
  DataMartRunTriggerType,
  DataMartRunType,
} from '../../../features/data-marts/shared';
import type { ProjectDataMartRunResponseDto } from '../../../features/data-marts/shared/types/api/response/data-mart-run.response.dto';
import { dataMartService } from '../../../features/data-marts/shared';
import { getConnectorInfoByName } from '../../../features/connectors/shared/utils';
import DataMartRunsPage from './DataMartRunsPage';

const dataMartServiceMock = vi.hoisted(() => ({
  getProjectDataMartRuns: vi.fn(),
  getDataMartRunById: vi.fn(),
  cancelDataMartRun: vi.fn(),
}));

const getConnectorInfoByNameMock = vi.hoisted(() => vi.fn());

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../../../features/data-marts/shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../features/data-marts/shared')>();
  return {
    ...actual,
    dataMartService: dataMartServiceMock,
  };
});

vi.mock('../../../features/connectors/shared/utils', () => ({
  getConnectorInfoByName: getConnectorInfoByNameMock,
}));

vi.mock('../../../app/api/apiClient', () => ({
  default: apiClientMock,
}));

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

describe('DataMartRunsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMartServiceMock.getDataMartRunById.mockImplementation(
      (_dataMartId: string, runId: string) =>
        Promise.resolve(buildGenericQualityRunDetail(runId, `Result for ${runId}`))
    );
    apiClientMock.get.mockImplementation((url: string) => {
      const runId = url.includes('run-older') ? 'run-older' : 'run-latest';
      return Promise.resolve({
        data: buildGenericQualityRunDetail(runId, `Legacy result for ${runId}`),
      });
    });
    vi.mocked(getConnectorInfoByName).mockResolvedValue({
      name: 'FacebookMarketing',
      displayName: 'Facebook Marketing',
      description: 'Facebook Marketing connector',
      logoBase64: 'data:image/png;base64,connector-logo',
      docUrl: null,
    });
  });

  it('shows a Data Mart-focused empty state when there are no project-wide runs', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns).mockResolvedValueOnce({
      runs: [],
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'No runs yet' })).toBeInTheDocument();
    expect(
      screen.getByText(/Data Mart runs will appear here as they start and finish/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a Data Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts'
    );
    expect(dataMartService.getProjectDataMartRuns).toHaveBeenCalledWith(50, 0, undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders connector logo and a Data Mart link for project-wide connector runs', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns).mockResolvedValueOnce({
      runs: [buildProjectRun({ status: DataMartRunStatus.SUCCESS })],
    });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Marketing Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/dm-1/run-history'
    );

    await waitFor(() => {
      expect(getConnectorInfoByName).toHaveBeenCalledWith('FacebookMarketing');
    });
    expect(await screen.findByRole('img', { name: 'icon' })).toHaveAttribute(
      'src',
      'data:image/png;base64,connector-logo'
    );
  });

  it('does not crash when a project connector run has no definition payload', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns).mockResolvedValueOnce({
      runs: [
        {
          ...buildProjectRun({ status: DataMartRunStatus.SUCCESS }),
          definitionRun: null as never,
        },
      ],
    });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Marketing Mart' })).toBeInTheDocument();
    expect(getConnectorInfoByName).not.toHaveBeenCalled();
  });

  it('renders a lightweight Data Quality summary in project-wide history', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns).mockResolvedValueOnce({
      runs: [
        buildProjectRun({
          status: DataMartRunStatus.SUCCESS,
          type: DataMartRunType.DATA_QUALITY,
          qualitySummary: {
            state: 'ISSUES',
            enabledChecks: 2,
            totalChecks: 2,
            passedChecks: 1,
            failedChecks: 1,
            notApplicableChecks: 0,
            errorChecks: 0,
            noticeFindings: 0,
            warningFindings: 1,
            errorFindings: 0,
            violationCount: 4,
            highestSeverity: 'warning',
            dataMartRunId: 'run-1',
            lastRunAt: '2026-06-05T10:01:00.000Z',
          },
        }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Manual data quality run')).toBeInTheDocument();
    expect(screen.getByText('1 finding')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(document.querySelector('.lucide-shield-check')).toBeInTheDocument();
  });

  it('keeps the shared history shell free of Data Quality-specific filters', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns).mockResolvedValueOnce({
      runs: [
        buildProjectRun({ id: 'connector-run', status: DataMartRunStatus.SUCCESS }),
        buildProjectRun({
          id: 'quality-run',
          status: DataMartRunStatus.SUCCESS,
          type: DataMartRunType.DATA_QUALITY,
          qualitySummary: buildQualitySummary('quality-run'),
        }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Manual connector run')).toBeInTheDocument();
    expect(screen.getByText('Manual data quality run')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Data quality' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All runs' })).not.toBeInTheDocument();
  });

  it('requests only the expanded project-level Quality run through generic detail', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns).mockResolvedValueOnce({
      runs: [
        buildProjectRun({
          id: 'run-latest',
          status: DataMartRunStatus.SUCCESS,
          type: DataMartRunType.DATA_QUALITY,
          qualitySummary: buildQualitySummary('run-latest'),
        }),
        buildProjectRun({
          id: 'run-older',
          status: DataMartRunStatus.SUCCESS,
          type: DataMartRunType.DATA_QUALITY,
          qualitySummary: buildQualitySummary('run-older'),
        }),
      ],
    });

    renderPage();

    const runRows = await screen.findAllByText('Manual data quality run');
    expect(dataMartServiceMock.getDataMartRunById).not.toHaveBeenCalled();
    expect(apiClientMock.get).not.toHaveBeenCalled();

    fireEvent.click(runRows[1]);

    fireEvent.click(await screen.findByRole('button', { name: /Negative values/ }));
    expect(await screen.findByText('Result for run-older')).toBeInTheDocument();
    expect(screen.queryByText('Result for run-latest')).not.toBeInTheDocument();
    expect(dataMartServiceMock.getDataMartRunById).toHaveBeenCalledTimes(1);
    expect(dataMartServiceMock.getDataMartRunById).toHaveBeenCalledWith(
      'dm-1',
      'run-older',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(apiClientMock.get).not.toHaveBeenCalled();
  });

  it('refreshes the first page while a loaded run is not final and stops after completion', async () => {
    vi.useFakeTimers();
    vi.mocked(dataMartService.getProjectDataMartRuns)
      .mockResolvedValueOnce({ runs: [buildProjectRun({ status: DataMartRunStatus.RUNNING })] })
      .mockResolvedValueOnce({ runs: [buildProjectRun({ status: DataMartRunStatus.SUCCESS })] });

    renderPage();

    await act(async () => {
      await Promise.resolve();
    });
    expect(dataMartService.getProjectDataMartRuns).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(dataMartService.getProjectDataMartRuns).toHaveBeenCalledTimes(2);
    expect(dataMartService.getProjectDataMartRuns).toHaveBeenLastCalledWith(50, 0, {
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(dataMartService.getProjectDataMartRuns).toHaveBeenCalledTimes(2);
  });

  it('loads the next run history batch with a 50-run offset', async () => {
    vi.mocked(dataMartService.getProjectDataMartRuns)
      .mockResolvedValueOnce({
        runs: Array.from({ length: 50 }, (_, index) =>
          buildProjectRun({
            id: `run-${index + 1}`,
            status: DataMartRunStatus.SUCCESS,
          })
        ),
      })
      .mockResolvedValueOnce({
        runs: [buildProjectRun({ id: 'run-51', status: DataMartRunStatus.SUCCESS })],
      });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Load More' }));

    await waitFor(() => {
      expect(dataMartService.getProjectDataMartRuns).toHaveBeenCalledTimes(2);
    });
    expect(dataMartService.getProjectDataMartRuns).toHaveBeenLastCalledWith(50, 50, undefined);
  });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/ui/project-1/data-marts/runs']}>
        <Routes>
          <Route path='/ui/:projectId/data-marts/runs' element={<DataMartRunsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function buildQualitySummary(dataMartRunId: string): DataQualityCompactSummary {
  return {
    state: 'ISSUES',
    enabledChecks: 1,
    totalChecks: 1,
    passedChecks: 0,
    failedChecks: 1,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 1,
    errorFindings: 0,
    violationCount: 1,
    highestSeverity: 'warning',
    dataMartRunId,
    lastRunAt: '2026-06-05T10:01:00.000Z',
  };
}

function buildProjectRun({
  id = 'run-1',
  status,
  type = DataMartRunType.CONNECTOR,
  qualitySummary = null,
}: {
  id?: string;
  status: DataMartRunStatus;
  type?: DataMartRunType;
  qualitySummary?: DataQualityCompactSummary | null;
}): ProjectDataMartRunResponseDto {
  return {
    id,
    dataMartId: 'dm-1',
    status,
    createdAt: '2026-06-05T10:00:00.000Z',
    logs: [],
    errors: [],
    definitionRun: {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: [],
          node: 'default',
          fields: [],
        },
        storage: {
          fullyQualifiedName: 'dataset.table',
        },
      },
    },
    type,
    runType: DataMartRunTriggerType.MANUAL,
    startedAt: '2026-06-05T10:00:00.000Z',
    finishedAt: status === DataMartRunStatus.SUCCESS ? '2026-06-05T10:01:00.000Z' : null,
    reportDefinition: null,
    reportId: null,
    insightDefinition: null,
    insightId: null,
    insightTemplateDefinition: null,
    insightTemplateId: null,
    aiSourceDefinition: null,
    createdByUser: null,
    additionalParams: null,
    qualitySummary,
    dataMart: {
      id: 'dm-1',
      title: 'Marketing Mart',
    },
  };
}

function buildGenericQualityRunDetail(runId: string, description: string) {
  return {
    id: runId,
    type: DataMartRunType.DATA_QUALITY,
    createdAt: '2026-06-05T10:00:00.000Z',
    startedAt: '2026-06-05T10:00:00.000Z',
    finishedAt: '2026-06-05T10:01:00.000Z',
    dataQuality: {
      snapshot: {
        config: { timezone: 'UTC', rules: [] },
        schema: { fields: [] },
        relationships: [],
        timezone: 'UTC',
        definitionType: 'SQL',
      },
      summary: {
        state: 'ISSUES',
        enabledChecks: 1,
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 1,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 1,
        errorFindings: 0,
        violationCount: 1,
        highestSeverity: 'warning',
      },
      results: [
        {
          id: `result-${runId}`,
          ruleKey: 'negative_values:field:amount',
          category: 'negative_values',
          scope: { type: 'FIELD', fieldId: 'amount' },
          severity: 'warning',
          status: 'FAILED',
          violationCount: 1,
          description,
          examples: [],
          executedSql: [],
          reproductionSql: null,
          error: null,
          redacted: false,
          createdAt: '2026-06-05T10:01:00.000Z',
        },
      ],
    },
  };
}
