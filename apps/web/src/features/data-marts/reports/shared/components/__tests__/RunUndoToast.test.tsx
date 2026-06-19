import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDismiss = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  toast: { dismiss: mockDismiss },
}));

import { RunUndoToast } from '../RunUndoToast';

describe('RunUndoToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the report name', () => {
    render(
      <RunUndoToast
        toastId='t1'
        reportName='Monthly Revenue'
        gracePeriodMs={5000}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Monthly Revenue/)).toBeInTheDocument();
  });

  it('calls onConfirm and dismisses the toast after gracePeriodMs', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <RunUndoToast
        toastId='t1'
        reportName='Test'
        gracePeriodMs={5000}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(mockDismiss).toHaveBeenCalledWith('t1');
  });

  it('does not call onConfirm before gracePeriodMs elapses', async () => {
    const onConfirm = vi.fn();

    render(
      <RunUndoToast
        toastId='t1'
        reportName='Test'
        gracePeriodMs={5000}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(4900);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel and dismisses when Cancel is clicked, and does not later call onConfirm', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <RunUndoToast
        toastId='t1'
        reportName='Test'
        gracePeriodMs={5000}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(mockDismiss).toHaveBeenCalledWith('t1');

    // Advance past grace period — onConfirm must NOT fire after cancel
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
