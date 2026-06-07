import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataMartRunStatus,
  DataMartRunTriggerType,
  DataMartRunType,
} from '../../../features/data-marts/shared';
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
    expect(dataMartService.getProjectDataMartRuns).toHaveBeenLastCalledWith(100, 0, {
      skipLoadingIndicator: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(dataMartService.getProjectDataMartRuns).toHaveBeenCalledTimes(2);
  });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-marts/runs']}>
      <DataMartRunsPage />
    </MemoryRouter>
  );
}

function buildProjectRun({ status }: { status: DataMartRunStatus }) {
  return {
    id: 'run-1',
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
    type: DataMartRunType.CONNECTOR,
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
    dataMart: {
      id: 'dm-1',
      title: 'Marketing Mart',
    },
  };
}
