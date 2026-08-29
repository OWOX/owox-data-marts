import { act, createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReportSchedulesInlineList,
  type ReportSchedulesInlineListHandle,
} from './ReportSchedulesInlineList';

const serviceMocks = vi.hoisted(() => ({
  createScheduledTrigger: vi.fn(),
  deleteScheduledTrigger: vi.fn(),
  getScheduledTriggers: vi.fn(),
  updateScheduledTrigger: vi.fn(),
}));

vi.mock('../../services', () => ({
  scheduledTriggerService: serviceMocks,
}));

describe('ReportSchedulesInlineList', () => {
  beforeEach(() => {
    serviceMocks.createScheduledTrigger.mockResolvedValue(undefined);
    serviceMocks.getScheduledTriggers.mockResolvedValue([]);
    const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/London']);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolvedOptions,
      timeZone: 'Etc/UTC',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('persists canonical UTC for a new inline schedule when the browser reports a UTC alias', async () => {
    const ref = createRef<ReportSchedulesInlineListHandle>();
    render(<ReportSchedulesInlineList ref={ref} dataMartId='data-mart-1' />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add trigger' }));

    await act(async () => {
      await ref.current?.persist('report-1');
    });

    expect(serviceMocks.createScheduledTrigger).toHaveBeenCalledWith(
      'data-mart-1',
      expect.objectContaining({ timeZone: 'UTC' })
    );
  });
});
