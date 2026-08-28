import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleConfig } from './ScheduleConfig';

describe('ScheduleConfig timezone selection', () => {
  beforeEach(() => {
    const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/Kiev', 'Europe/London']);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolvedOptions,
      timeZone: 'Europe/London',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the modern Kyiv spelling for the compatible Europe/Kiev value', () => {
    render(<ScheduleConfig timezone='Europe/Kiev' />);

    expect(screen.getByText(/^Europe\/Kyiv \(/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Preview'));

    expect(screen.getByText('Europe/Kyiv')).toBeInTheDocument();
    expect(screen.queryByText('Europe/Kiev')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Schedule runs in Europe/Kyiv (not your local Europe/London time). Execution time may differ from expected.'
      )
    ).toBeInTheDocument();
  });

  it('lets the user select UTC and emits the canonical UTC value', async () => {
    const onChange = vi.fn();
    render(<ScheduleConfig timezone='Europe/London' onChange={onChange} />);

    const timezoneCombobox = screen.getAllByRole('combobox')[1];
    expect(timezoneCombobox).toHaveTextContent(/^Europe\/London \(/);
    fireEvent.click(timezoneCombobox);
    fireEvent.click(
      await within(document.body).findByRole('option', {
        name: 'UTC (+00:00, no DST)',
      })
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        cron: '0 9 * * *',
        timezone: 'UTC',
        enabled: true,
      });
    });
  });
});
