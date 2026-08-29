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

  it.each(['Etc/UTC', 'GMT', 'Etc/GMT'])(
    'represents the stored %s alias as UTC without changing the emitted value',
    async timezone => {
      const onChange = vi.fn();
      render(<ScheduleConfig timezone={timezone} onChange={onChange} />);

      expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent('UTC (+00:00)');

      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith({
          cron: '0 9 * * *',
          timezone,
          enabled: true,
        });
      });
    }
  );

  it('does not warn when a stored UTC alias matches the browser UTC timezone', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...Intl.DateTimeFormat().resolvedOptions(),
      timeZone: 'UTC',
    });

    render(<ScheduleConfig timezone='Etc/UTC' />);

    fireEvent.click(screen.getByText('Preview'));

    expect(
      screen.queryByText(/Schedule runs in UTC \(not your local UTC time\)/)
    ).not.toBeInTheDocument();
  });

  it('keeps a stored Europe/Kiev schedule selectable on a modern runtime without a mismatch warning', async () => {
    const onChange = vi.fn();
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/Kyiv', 'Europe/London']);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...Intl.DateTimeFormat().resolvedOptions(),
      timeZone: 'Europe/Kyiv',
    });

    render(<ScheduleConfig timezone='Europe/Kiev' onChange={onChange} />);

    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(
      /^Europe\/Kyiv \(/
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        cron: '0 9 * * *',
        timezone: 'Europe/Kiev',
        enabled: true,
      });
    });

    fireEvent.click(screen.getByText('Preview'));

    expect(screen.queryByText(/not your local Europe\/Kyiv time/)).not.toBeInTheDocument();
  });

  it.each([
    ['Kiev', /^Europe\/Kyiv \(/],
    ['Etc/UTC', 'UTC (+00:00)'],
    ['GMT', 'UTC (+00:00)'],
  ])('finds canonical timezone options by the hidden %s alias', async (search, optionName) => {
    render(<ScheduleConfig timezone='Europe/London' />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: search } });

    expect(
      await within(document.body).findByRole('option', { name: optionName })
    ).toBeInTheDocument();
  });

  it('lets the user select UTC and emits the canonical UTC value', async () => {
    const onChange = vi.fn();
    render(<ScheduleConfig timezone='Europe/London' onChange={onChange} />);

    const timezoneCombobox = screen.getByRole('combobox', { name: 'Timezone' });
    expect(timezoneCombobox).toHaveTextContent(/^Europe\/London \(/);
    fireEvent.click(timezoneCombobox);
    fireEvent.click(
      await within(document.body).findByRole('option', {
        name: 'UTC (+00:00)',
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
