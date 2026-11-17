import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationSettingsItem } from '../../types';
import { EditNotificationSheet } from './EditNotificationSheet';

vi.mock('../../hooks', () => ({
  useProjectMembers: () => ({ members: [], isLoading: false }),
  useTestWebhook: () => ({ testWebhook: vi.fn(), isTesting: false }),
}));
vi.mock('./form/GeneralSection', () => ({ GeneralSection: () => null }));
vi.mock('./selection/RecipientsSection', () => ({ RecipientsSection: () => null }));
vi.mock('./form/GroupingDelaySection', () => ({ GroupingDelaySection: () => null }));
vi.mock('./form/WebhookSection', () => ({ WebhookSection: () => null }));

const setting = {
  notificationType: 'FAILED_RUNS',
  enabled: true,
  receivers: [],
  webhookUrl: null,
  groupingDelayCron: '0 * * * *',
} as unknown as NotificationSettingsItem;

function renderSheet(link?: string | null) {
  return render(
    <EditNotificationSheet
      isOpen
      onClose={vi.fn()}
      setting={setting}
      projectId='p1'
      onSave={vi.fn()}
      link={link}
    />
  );
}

describe('EditNotificationSheet', () => {
  it('shows Copy link only when it gets a link', () => {
    const { unmount } = renderSheet();
    expect(screen.queryByRole('button', { name: 'Copy link to this notification' })).toBeNull();
    unmount();

    renderSheet('https://app.test/ui/p1/notifications?notification=FAILED_RUNS');
    expect(
      screen.getByRole('button', { name: 'Copy link to this notification' })
    ).toBeInTheDocument();
  });
});
