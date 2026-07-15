// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunItem } from './RunItem';
import { LogViewType } from './types';
import { DataMartRunStatus, DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../../model/types/data-mart-run';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('./DataQualityRunHistoryDetails', () => ({
  DataQualityRunHistoryDetails: (props: {
    projectId: string;
    dataMartId: string;
    runId: string;
  }) => <div data-testid='quality-history-detail'>{JSON.stringify(props)}</div>,
}));

const createRun = (overrides: Partial<DataMartRunItem> = {}): DataMartRunItem =>
  ({
    id: 'run-1',
    status: DataMartRunStatus.RUNNING,
    createdAt: new Date('2026-06-04T12:00:00.000Z'),
    logs: [],
    errors: [],
    definitionRun: {} as DataMartRunItem['definitionRun'],
    type: DataMartRunType.CONNECTOR,
    triggerType: DataMartRunTriggerType.MANUAL,
    startedAt: new Date('2026-06-04T12:00:00.000Z'),
    finishedAt: null,
    reportDefinition: null,
    reportId: null,
    insightDefinition: null,
    insightId: null,
    insightTemplateDefinition: null,
    insightTemplateId: null,
    aiAssistantDefinition: null,
    createdByUser: null,
    additionalParams: null,
    qualitySummary: null,
    ...overrides,
  }) as DataMartRunItem;

interface DataMartRef {
  id: string;
  title: string;
  href: string;
}

const renderRunItem = (
  run: DataMartRunItem,
  isExpanded = false,
  cancelDataMartRun = vi.fn().mockResolvedValue(undefined),
  dataMartId: string | undefined = 'dm-1',
  dataMartRef?: DataMartRef
) => {
  const onToggle = vi.fn();

  render(
    <MemoryRouter>
      <RunItem
        run={run}
        isExpanded={isExpanded}
        onToggle={onToggle}
        logViewType={LogViewType.STRUCTURED}
        setLogViewType={vi.fn()}
        searchTerm=''
        setSearchTerm={vi.fn()}
        cancelDataMartRun={cancelDataMartRun}
        dataMartId={dataMartId}
        dataMartConnectorInfo={null}
        dataMartRef={dataMartRef}
      />
    </MemoryRouter>
  );

  return { onToggle, cancelDataMartRun };
};

const createReportRun = (dataMartRef?: DataMartRef): DataMartRunItem =>
  createRun({
    type: DataMartRunType.EMAIL,
    triggerType: DataMartRunTriggerType.SCHEDULED,
    createdAt: buildRunTimestamp(),
    startedAt: buildRunTimestamp(),
    definitionRun: {
      sqlQuery: 'select 1',
    } as DataMartRunItem['definitionRun'],
    reportDefinition: {
      title: 'Campaigns Campaigns Campaigns Campaigns Campaigns Campaigns',
      destination: {
        id: 'destination-1',
        title: 'Looker Studio',
        type: 'LOOKER_STUDIO',
      },
      destinationConfig: {
        type: 'looker-studio-config',
        cacheLifetime: 3600,
      },
    },
    reportId: 'report-1',
    createdByUser: dataMartRef
      ? {
          userId: '320',
          fullName: 'Oleksandr Kalnyk',
          email: 'a.kalnik@owox.com',
          avatar: null,
        }
      : null,
  });

function buildRunTimestamp(): Date {
  // Keep the expected local display stable across developer and CI time zones.
  return new Date(2026, 5, 7, 18, 35, 0);
}

describe('RunItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires confirmation before cancelling a running connector run', async () => {
    const { cancelDataMartRun, onToggle } = renderRunItem(createRun(), true);
    const cancelButton = screen.getByRole('button', { name: 'Cancel run' });

    expect(cancelButton).toHaveClass('cursor-pointer');
    expect(cancelButton).toHaveClass('bg-destructive');

    fireEvent.click(cancelButton);

    expect(cancelDataMartRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Cancel run?')).toBeInTheDocument();
    expect(screen.getByText(/may result in incomplete data/i)).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel run' }));

    await waitFor(() => {
      expect(cancelDataMartRun).toHaveBeenCalledWith('dm-1', 'run-1');
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps confirmation open and shows an error when cancellation fails', async () => {
    const cancelDataMartRun = vi.fn().mockRejectedValue({
      response: {
        data: {
          message: 'Cannot cancel data mart run in SUCCESS status',
        },
      },
    });
    renderRunItem(createRun(), true, cancelDataMartRun);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel run' }));

    await waitFor(() => {
      expect(cancelDataMartRun).toHaveBeenCalledWith('dm-1', 'run-1');
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Cannot cancel data mart run in SUCCESS status');
  });

  it('disables the dialog confirmation while cancellation is in progress', async () => {
    const cancelDataMartRun = vi.fn(
      () =>
        new Promise<void>(() => {
          // Keep request pending to inspect the in-flight UI state.
        })
    );
    renderRunItem(createRun(), true, cancelDataMartRun);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Cancel run' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmButton).toBeDisabled();
    });
    expect(cancelDataMartRun).toHaveBeenCalledTimes(1);
  });

  it('shows the expanded controls cancel button for a pending standard report run', () => {
    renderRunItem(
      createRun({
        type: DataMartRunType.GOOGLE_SHEETS_EXPORT,
        status: DataMartRunStatus.PENDING,
        reportId: 'report-1',
      }),
      true
    );

    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeInTheDocument();
  });

  it('does not show a cancel button when data mart id is unavailable', () => {
    render(
      <MemoryRouter>
        <RunItem
          run={createRun()}
          isExpanded={true}
          onToggle={vi.fn()}
          logViewType={LogViewType.STRUCTURED}
          setLogViewType={vi.fn()}
          searchTerm=''
          setSearchTerm={vi.fn()}
          cancelDataMartRun={vi.fn()}
          dataMartConnectorInfo={null}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('does not show a cancel button in the collapsed row', () => {
    renderRunItem(createRun());

    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('does not show a cancel button for Looker Studio or HTTP Data runs', () => {
    const { rerender } = render(
      <MemoryRouter>
        <RunItem
          run={createRun({ type: DataMartRunType.LOOKER_STUDIO })}
          isExpanded={true}
          onToggle={vi.fn()}
          logViewType={LogViewType.STRUCTURED}
          setLogViewType={vi.fn()}
          searchTerm=''
          setSearchTerm={vi.fn()}
          cancelDataMartRun={vi.fn()}
          dataMartId='dm-1'
          dataMartConnectorInfo={null}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <RunItem
          run={createRun({ type: DataMartRunType.HTTP_DATA })}
          isExpanded={true}
          onToggle={vi.fn()}
          logViewType={LogViewType.STRUCTURED}
          setLogViewType={vi.fn()}
          searchTerm=''
          setSearchTerm={vi.fn()}
          cancelDataMartRun={vi.fn()}
          dataMartId='dm-1'
          dataMartConnectorInfo={null}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('keeps the Data Mart tab row on one line when no Data Mart reference is shown', () => {
    renderRunItem(createReportRun());

    expect(screen.queryByRole('link', { name: 'Campaigns' })).not.toBeInTheDocument();

    const startedAt = screen.getByText('2026-06-07 18:35:00');
    const summary = screen.getByText('Scheduled report run');
    expect(startedAt).toHaveClass('shrink-0', 'whitespace-nowrap');
    expect(startedAt.closest('.flex-wrap')).toBeNull();
    expect(summary.closest('.flex-wrap')).toBeNull();
  });

  it('uses the wrapped two-line layout when a project-wide Data Mart reference is shown', () => {
    const dataMartRef = {
      id: 'dm-1',
      title: 'Campaigns',
      href: '/ui/project-1/data-marts/dm-1/run-history',
    };

    renderRunItem(createReportRun(dataMartRef), false, undefined, 'dm-1', dataMartRef);

    expect(screen.getByRole('link', { name: 'Campaigns' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/dm-1/run-history'
    );
    expect(screen.getByText('2026-06-07 18:35:00').closest('.flex-wrap')).not.toBeNull();
  });

  it('shows the lightweight Quality summary without loading full details while collapsed', () => {
    renderRunItem(createQualityRun(), false);

    expect(screen.getByText('1 warning finding')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-history-detail')).not.toBeInTheDocument();
  });

  it('mounts the full Quality detail loader only when expanded', () => {
    renderRunItem(createQualityRun(), true);

    expect(screen.getByTestId('quality-history-detail')).toHaveTextContent('"dataMartId":"dm-1"');
    expect(screen.getByTestId('quality-history-detail')).toHaveTextContent('"runId":"run-1"');
    expect(screen.queryByText('Structured')).not.toBeInTheDocument();
  });
});

function createQualityRun(): DataMartRunItem {
  return createRun({
    type: DataMartRunType.DATA_QUALITY,
    status: DataMartRunStatus.SUCCESS,
    finishedAt: new Date('2026-06-04T12:01:00.000Z'),
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
      violationCount: 3,
      highestSeverity: 'warning',
      dataMartRunId: 'run-1',
      lastRunAt: '2026-06-04T12:01:00.000Z',
    },
  });
}
