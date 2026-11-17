import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerFormSheet } from './ScheduledTriggerFormSheet';

vi.mock('../ScheduledTriggerForm', () => ({ ScheduledTriggerForm: () => null }));
vi.mock('../../model', () => ({
  useScheduledTriggerContext: () => ({
    createScheduledTrigger: vi.fn(),
    updateScheduledTrigger: vi.fn(),
  }),
}));
vi.mock('../../../../../utils', () => ({ trackEvent: vi.fn() }));
vi.mock('../../../../../shared/hooks/useIntercomLauncher', () => ({
  useIntercomLauncher: vi.fn(),
}));

const trigger = {
  id: 't1',
  type: 'CONNECTOR_RUN',
  cronExpression: '0 9 * * *',
  timeZone: 'UTC',
  isActive: true,
  triggerConfig: null,
} as unknown as ScheduledTrigger;

const linkName = 'Copy link to this trigger';
const link = 'https://app.test/ui/p1/data-marts/dm1/triggers?trigger=t1';

function renderSheet(props: { trigger?: ScheduledTrigger | null; link?: string | null }) {
  return render(<ScheduledTriggerFormSheet isOpen onClose={vi.fn()} dataMartId='dm1' {...props} />);
}

describe('ScheduledTriggerFormSheet', () => {
  it('shows Copy link only in edit mode with a link', () => {
    const { unmount } = renderSheet({ trigger });
    expect(screen.queryByRole('button', { name: linkName })).toBeNull();
    unmount();

    const edit = renderSheet({ trigger, link });
    expect(screen.getByRole('button', { name: linkName })).toBeInTheDocument();
    expect(screen.getByText('Edit Scheduled Trigger')).toBeInTheDocument();
    edit.unmount();

    renderSheet({ link });
    expect(screen.queryByRole('button', { name: linkName })).toBeNull();
    expect(screen.getByText('Create Scheduled Trigger')).toBeInTheDocument();
  });
});
