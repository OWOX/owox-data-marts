import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let isAdmin = false;

vi.mock('../../../features/idp/hooks/useRole', () => ({ useIsAdmin: () => isAdmin }));
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
// Each tab has its own suite; here they only show which one is mounted and what it was given.
vi.mock('./AllSchedulesTab', () => ({
  AllSchedulesTab: ({ isAdmin: admin }: { isAdmin: boolean }) => (
    <p>{`All Schedules content, admin: ${String(admin)}`}</p>
  ),
}));
vi.mock('./RunHistoryTab', () => ({
  RunHistoryTab: ({ isAdmin: admin }: { isAdmin: boolean }) => (
    <p>{`Run History content, admin: ${String(admin)}`}</p>
  ),
}));

import PluginSchedulesPage from './PluginSchedulesPage';

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid='location'>{pathname + search}</output>;
}

const currentLocation = () => screen.getByTestId('location').textContent;

function renderPage(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PluginSchedulesPage />
      <Location />
    </MemoryRouter>
  );
}

describe('PluginSchedulesPage', () => {
  beforeEach(() => {
    isAdmin = false;
  });

  it('opens on All Schedules under the Plugins breadcrumb', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Schedules' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Schedules that run plugin actions while the plugin is closed, and every run.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All Schedules' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Run History' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('All Schedules content, admin: false')).toBeInTheDocument();
    expect(screen.queryByText(/^Run History content/)).toBeNull();
  });

  it('opens Run History from the URL and tells the tab the caller is an admin', () => {
    isAdmin = true;

    renderPage('/?tab=runs');

    expect(screen.getByRole('link', { name: 'Run History' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByText('Run History content, admin: true')).toBeInTheDocument();
  });

  it('keeps the plugin and owner filters across tabs and drops the rest', async () => {
    const { unmount } = renderPage('/?schedule=s1&plugin=p1&status=paused&owner=u1');

    fireEvent.click(screen.getByRole('link', { name: 'Run History' }));

    await waitFor(() => {
      expect(currentLocation()).toBe('/?tab=runs&plugin=p1&owner=u1');
    });
    expect(screen.getByText('Run History content, admin: false')).toBeInTheDocument();
    unmount();

    renderPage('/?tab=runs&run=r1&schedule=s1&status=FAILED&source=page&plugin=p1&owner=u1');

    fireEvent.click(screen.getByRole('link', { name: 'All Schedules' }));

    await waitFor(() => {
      expect(currentLocation()).toBe('/?plugin=p1&owner=u1');
    });
    expect(screen.getByText('All Schedules content, admin: false')).toBeInTheDocument();
  });

  it('goes back to Plugins from the breadcrumb', async () => {
    renderPage('/?tab=runs');

    fireEvent.click(screen.getByRole('link', { name: 'Plugins' }));

    await waitFor(() => {
      expect(currentLocation()).toBe('/ui/project-1/plugins');
    });
  });
});
