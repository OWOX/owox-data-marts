// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    ...overrides,
  }) as DataMartRunItem;

const renderRunItem = (
  run: DataMartRunItem,
  isExpanded = false,
  cancelDataMartRun = vi.fn().mockResolvedValue(undefined),
  dataMartId: string | undefined = 'dm-1'
) => {
  const onToggle = vi.fn();

  render(
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
    />
  );

  return { onToggle, cancelDataMartRun };
};

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
    );

    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('does not show a cancel button in the collapsed row', () => {
    renderRunItem(createRun());

    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('does not show a cancel button for Looker Studio or HTTP Data runs', () => {
    const { rerender } = render(
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
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    rerender(
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
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });
});
