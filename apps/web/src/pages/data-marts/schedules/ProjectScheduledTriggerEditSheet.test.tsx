import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScheduledTriggerType } from '../../../features/data-marts/scheduled-triggers/enums';
import type { ProjectScheduledTrigger } from '../../../features/data-marts/scheduled-triggers/model/scheduled-trigger.model';
import { ProjectScheduledTriggerEditSheet } from './ProjectScheduledTriggerEditSheet';

vi.mock('../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerForm', () => ({
  ScheduledTriggerForm: () => null,
}));
vi.mock('../../../shared/hooks/useIntercomLauncher', () => ({ useIntercomLauncher: vi.fn() }));
vi.mock('../shared/projectDataMartContext', () => ({
  buildProjectDataMartContextValue: () => ({}),
}));

const trigger = {
  id: 't1',
  type: ScheduledTriggerType.CONNECTOR_RUN,
  cronExpression: '0 9 * * *',
  timeZone: 'UTC',
  isActive: true,
  triggerConfig: null,
  dataMart: { id: 'dm1', title: 'Mart' },
} as unknown as ProjectScheduledTrigger;

function renderSheet(link?: string | null) {
  return render(
    <ProjectScheduledTriggerEditSheet trigger={trigger} isOpen onClose={vi.fn()} link={link} />
  );
}

describe('ProjectScheduledTriggerEditSheet', () => {
  it('shows Copy link only when it gets a link', () => {
    const { unmount } = renderSheet();
    expect(screen.queryByRole('button', { name: 'Copy link to this schedule' })).toBeNull();
    unmount();

    renderSheet('https://app.test/ui/p1/data-marts/schedules?trigger=t1');
    expect(screen.getByRole('button', { name: 'Copy link to this schedule' })).toBeInTheDocument();
  });
});
