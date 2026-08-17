import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MouseEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reconnectSheet = vi.fn();
const runReport = vi.fn();
const fetchReportsByDataMartId = vi.fn();
const toastSuccess = vi.fn();
const showApiErrorToast = vi.fn();

// Radix dropdowns need real pointer events — render everything inline instead
// (the established pattern for menu tests in this codebase).
vi.mock('@owox/ui/components/dropdown-menu', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      onClick,
      disabled,
    }: {
      children?: ReactNode;
      onClick?: MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
    }) => (
      <button type='button' disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

vi.mock('../../../../../../shared/utils/showApiErrorToast', () => ({
  showApiErrorToast: (...args: unknown[]) => showApiErrorToast(...args),
}));

vi.mock('../../../shared', () => ({
  ReportStatusEnum: {
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
    RUNNING: 'RUNNING',
    CANCELLED: 'CANCELLED',
    RESTRICTED: 'RESTRICTED',
  },
  useReport: () => ({ deleteReport: vi.fn(), fetchReportsByDataMartId, runReport }),
  reportService: { reconnectSheet: (...args: unknown[]) => reconnectSheet(...args) },
}));

import { GoogleSheetsActionsCell } from './GoogleSheetsActionsCell';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

const buildReport = (lastRunStatus: string) =>
  ({
    id: 'report-1',
    title: 'Revenue',
    lastRunStatus,
    canRun: true,
    canEditConfig: true,
    dataMart: { id: 'dm-1' },
  }) as unknown as DataMartReport;

describe('GoogleSheetsActionsCell — Reconnect & run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reconnectSheet.mockResolvedValue({
      spreadsheetId: 'spread-1',
      sheetId: 7,
      sheetTitle: 'Revenue',
      created: true,
      changed: true,
    });
    runReport.mockResolvedValue(true);
    fetchReportsByDataMartId.mockResolvedValue(undefined);
  });

  it('is hidden unless the last run failed', () => {
    render(<GoogleSheetsActionsCell row={{ original: buildReport('SUCCESS') }} />);

    expect(screen.queryByText('Reconnect & run')).not.toBeInTheDocument();
  });

  it('reconnects, reports the outcome, then runs the report', async () => {
    render(<GoogleSheetsActionsCell row={{ original: buildReport('ERROR') }} />);

    fireEvent.click(screen.getByText('Reconnect & run'));

    await waitFor(() => {
      expect(fetchReportsByDataMartId).toHaveBeenCalledWith('dm-1');
    });
    expect(reconnectSheet).toHaveBeenCalledWith('report-1');
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Created sheet "Revenue"'),
      expect.anything()
    );
    expect(runReport).toHaveBeenCalledWith('report-1');
    // Reconnect strictly before run — running first would write into the dead sheet.
    expect(reconnectSheet.mock.invocationCallOrder[0]).toBeLessThan(
      runReport.mock.invocationCallOrder[0]
    );
  });

  it('tells the truth when the sheet was already connected', async () => {
    // changed: false — the backend found the stored gid alive and touched nothing.
    reconnectSheet.mockResolvedValueOnce({
      spreadsheetId: 'spread-1',
      sheetId: 7,
      sheetTitle: 'Revenue',
      created: false,
      changed: false,
    });
    render(<GoogleSheetsActionsCell row={{ original: buildReport('ERROR') }} />);

    fireEvent.click(screen.getByText('Reconnect & run'));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('already connected to the sheet "Revenue"'),
        expect.anything()
      );
    });
    expect(runReport).toHaveBeenCalledWith('report-1');
  });

  it('releases the running state when the run fails to start', async () => {
    runReport.mockResolvedValueOnce(false);
    render(<GoogleSheetsActionsCell row={{ original: buildReport('ERROR') }} />);

    fireEvent.click(screen.getByText('Reconnect & run'));

    await waitFor(() => {
      expect(fetchReportsByDataMartId).toHaveBeenCalledWith('dm-1');
    });
    // Not stuck on the disabled "Running report..." label.
    expect(screen.getByText('Run report')).toBeInTheDocument();
  });

  it('surfaces a reconnect failure and does not run the report', async () => {
    reconnectSheet.mockRejectedValueOnce(new Error('boom'));
    render(<GoogleSheetsActionsCell row={{ original: buildReport('ERROR') }} />);

    fireEvent.click(screen.getByText('Reconnect & run'));

    await waitFor(() => {
      expect(showApiErrorToast).toHaveBeenCalled();
    });
    expect(runReport).not.toHaveBeenCalled();
  });
});
