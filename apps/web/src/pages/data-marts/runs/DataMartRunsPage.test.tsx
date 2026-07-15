import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  cancelDataMartRun: vi.fn(),
}));

const getConnectorInfoByNameMock = vi.hoisted(() => vi.fn());

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
    expect(screen.getByText('1 warning finding')).toBeInTheDocument();
    expect(document.querySelector('.lucide-shield-check')).toBeInTheDocument();
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
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-marts/runs']}>
      <DataMartRunsPage />
    </MemoryRouter>
  );
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
