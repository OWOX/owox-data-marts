import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledTriggerType } from '../../enums';
import { ScheduledTriggerForm } from './ScheduledTriggerForm';

describe('ScheduledTriggerForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Data Quality Run as a config-less trigger type', () => {
    render(
      <ScheduledTriggerForm
        preSelectedType={ScheduledTriggerType.DATA_QUALITY_RUN}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Trigger Type' })).toHaveTextContent(
      'Data Quality Run'
    );
    expect(screen.queryByText('Report')).not.toBeInTheDocument();
  });

  it('submits canonical UTC when the browser reports a stored UTC alias', async () => {
    const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/London']);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolvedOptions,
      timeZone: 'Etc/UTC',
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ScheduledTriggerForm
        preSelectedType={ScheduledTriggerType.DATA_QUALITY_RUN}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent('UTC (+00:00)');

    fireEvent.change(screen.getByDisplayValue('09:00'), { target: { value: '10:00' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create trigger' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create trigger' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'UTC' }));
    });
  });
});
