import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportStatusEnum } from '../../enums';

const mockRunReport = vi.hoisted(() => vi.fn());
vi.mock('../../model', () => ({
  useReport: () => ({ runReport: mockRunReport }),
}));

const mockToastCustom = vi.hoisted(() => vi.fn().mockReturnValue('mock-id'));
vi.mock('react-hot-toast', () => ({
  toast: { custom: mockToastCustom, dismiss: vi.fn() },
}));

import { ReportQuickRunCell } from '../ReportQuickRunCell';
import type { DataMartReport } from '../../model/types/data-mart-report';

function makeReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'report-1',
    title: 'Monthly Revenue',
    canRun: true,
    lastRunStatus: ReportStatusEnum.SUCCESS,
    ...overrides,
  } as DataMartReport;
}

describe('ReportQuickRunCell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Run button when report canRun is true', () => {
    render(<ReportQuickRunCell report={makeReport()} />);
    expect(screen.getByRole('button', { name: /run report/i })).toBeInTheDocument();
  });

  it('disables the button immediately after clicking Run (isPending)', () => {
    render(<ReportQuickRunCell report={makeReport()} />);

    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows toast.custom with bottom-center position when Run is clicked', () => {
    render(<ReportQuickRunCell report={makeReport()} />);

    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    expect(mockToastCustom).toHaveBeenCalledOnce();
    expect(mockToastCustom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ position: 'bottom-center', duration: Infinity })
    );
  });

  it('calls runReport when onConfirm is invoked via the toast', async () => {
    mockRunReport.mockResolvedValue(undefined);

    render(<ReportQuickRunCell report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    // Extract the render function passed to toast.custom and invoke it
    // to get the RunUndoToast element, then grab its onConfirm prop
    const renderFn = mockToastCustom.mock.calls[0][0] as (t: { id: string }) => ReactElement;
    const element = renderFn({ id: 'mock-id' });
    const { onConfirm } = element.props as { onConfirm: () => Promise<void>; onCancel: () => void };

    await act(async () => {
      await onConfirm();
    });

    expect(mockRunReport).toHaveBeenCalledWith('report-1');
  });

  it('re-enables the button when onCancel is invoked via the toast', async () => {
    render(<ReportQuickRunCell report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    expect(screen.getByRole('button')).toBeDisabled();

    const renderFn = mockToastCustom.mock.calls[0][0] as (t: { id: string }) => ReactElement;
    const element = renderFn({ id: 'mock-id' });
    const { onCancel } = element.props as { onConfirm: () => Promise<void>; onCancel: () => void };

    act(() => {
      onCancel();
    });

    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('disables the button when report canRun is false', () => {
    render(<ReportQuickRunCell report={makeReport({ canRun: false })} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call toast.custom if Run is clicked while already pending', () => {
    render(<ReportQuickRunCell report={makeReport()} />);

    fireEvent.click(screen.getByRole('button', { name: /run report/i }));
    // Button is now disabled — second click should be a no-op
    fireEvent.click(screen.getByRole('button'));

    expect(mockToastCustom).toHaveBeenCalledOnce();
  });

  it('removes the spinner after the deferred run is confirmed', async () => {
    mockRunReport.mockResolvedValue(undefined);

    render(<ReportQuickRunCell report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    const renderFn = mockToastCustom.mock.calls[0][0] as (t: { id: string }) => ReactElement;
    const element = renderFn({ id: 'mock-id' });
    const { onConfirm } = element.props as { onConfirm: () => Promise<void>; onCancel: () => void };

    await act(async () => {
      await onConfirm();
    });

    expect(screen.getByRole('button')).not.toHaveAttribute('aria-label', 'Starting soon…');
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('shows a disabled Run button while the actual report run is in progress', async () => {
    mockRunReport.mockImplementation(() => new Promise(() => {}));

    render(<ReportQuickRunCell report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    const renderFn = mockToastCustom.mock.calls[0][0] as (t: { id: string }) => ReactElement;
    const element = renderFn({ id: 'mock-id' });
    const { onConfirm } = element.props as { onConfirm: () => Promise<void>; onCancel: () => void };

    // Trigger the actual run but do not await it, simulating a long-running request.
    act(() => {
      void onConfirm();
    });

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-label', 'Report is running…');
    });

    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('removes the spinner and runs the report when RunUndoToast fires onConfirm after grace period', async () => {
    mockRunReport.mockResolvedValue(undefined);

    render(<ReportQuickRunCell report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /run report/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    // Simulate RunUndoToast calling onConfirm when its countdown expires
    const renderFn = mockToastCustom.mock.calls[0][0] as (t: { id: string }) => ReactElement;
    const element = renderFn({ id: 'mock-id' });
    const { onConfirm } = element.props as { onConfirm: () => Promise<void> };

    await act(async () => {
      await onConfirm();
    });

    expect(mockRunReport).toHaveBeenCalledWith('report-1');
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });
});
