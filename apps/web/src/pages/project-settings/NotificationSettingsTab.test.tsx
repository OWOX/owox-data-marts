import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettingsTab } from './NotificationSettingsTab';

const settings = [{ notificationType: 'FAILED_RUNS' }, { notificationType: 'SUCCESS_RUNS' }];

const mocks = vi.hoisted(() => ({ toastError: vi.fn(), useNotificationSettings: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() }),
}));
vi.mock('../../shared/hooks/useProjectId', () => ({ useProjectId: () => 'p1' }));
vi.mock('../../features/project-settings/notifications', () => ({
  useNotificationSettings: mocks.useNotificationSettings,
  NotificationSettingsTable: ({
    onRowClick,
  }: {
    onRowClick: (setting: (typeof settings)[number]) => void;
  }) => (
    <button
      onClick={() => {
        onRowClick(settings[0]);
      }}
    >
      Edit FAILED_RUNS
    </button>
  ),
  EditNotificationSheet: ({
    setting,
    link,
    onClose,
  }: {
    setting: (typeof settings)[number] | null;
    link?: string | null;
    onClose: () => void;
  }) =>
    setting ? (
      <div data-testid='editSheet'>
        {setting.notificationType}
        <span data-testid='editLink'>{link}</span>
        <button onClick={onClose}>Close sheet</button>
      </div>
    ) : null,
}));

function Search() {
  return <div data-testid='search'>{useLocation().search}</div>;
}

function renderTab(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/notifications',
        element: (
          <>
            <NotificationSettingsTab />
            <Search />
          </>
        ),
      },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
}

function loaded(overrides: Record<string, unknown> = {}) {
  mocks.useNotificationSettings.mockReturnValue({
    settings,
    isLoading: false,
    error: null,
    updateSetting: vi.fn(),
    ...overrides,
  });
}

describe('NotificationSettingsTab', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
    loaded();
  });

  it('opens the linked notification, keeps the parameter while open and drops it on close', async () => {
    renderTab('/notifications?notification=SUCCESS_RUNS');

    expect(await screen.findByTestId('editSheet')).toHaveTextContent('SUCCESS_RUNS');
    expect(screen.getByTestId('search').textContent).toBe('?notification=SUCCESS_RUNS');
    expect(screen.getByTestId('editLink').textContent).toContain(
      '/notifications?notification=SUCCESS_RUNS'
    );

    fireEvent.click(screen.getByText('Close sheet'));
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('writes the notification to the URL when a row opens the sheet', async () => {
    renderTab('/notifications');

    fireEvent.click(screen.getByText('Edit FAILED_RUNS'));

    expect(await screen.findByTestId('editSheet')).toHaveTextContent('FAILED_RUNS');
    expect(screen.getByTestId('search').textContent).toBe('?notification=FAILED_RUNS');
  });

  it('shows a toast and drops the parameter for an unknown notification', async () => {
    renderTab('/notifications?notification=gone');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('This notification is not available.', {
        id: 'notification-not-found',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('keeps the parameter without a toast when the settings fail to load', () => {
    loaded({ settings: [], error: 'Failed to load' });
    renderTab('/notifications?notification=FAILED_RUNS');

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?notification=FAILED_RUNS');
  });

  it('waits while the settings load', () => {
    loaded({ settings: [], isLoading: true });
    renderTab('/notifications?notification=FAILED_RUNS');

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?notification=FAILED_RUNS');
  });
});
