import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScheduledTriggerType } from '../../enums';
import { ScheduledTriggerForm } from './ScheduledTriggerForm';

describe('ScheduledTriggerForm', () => {
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
});
