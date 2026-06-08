import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@owox/ui/components/sidebar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MainMenu } from './MainMenu';

vi.mock('../../../features/idp', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: {
      id: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
    },
  }),
}));

describe('MainMenu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['Reports', '/ui/project-1/data-marts/reports'],
    ['Insights', '/ui/project-1/data-marts/insights'],
    ['Triggers', '/ui/project-1/data-marts/schedules'],
    ['Run History', '/ui/project-1/data-marts/runs'],
  ])('marks the project-wide %s item active without also activating Data Marts', (label, path) => {
    renderMenu(path);

    expect(screen.getByRole('link', { name: label })).toHaveClass('bg-sidebar-active');
    expect(screen.getByRole('link', { name: 'Data Marts' })).not.toHaveClass('bg-sidebar-active');
  });

  it('renders project-wide Data Mart items as sub-items under Data Marts', () => {
    renderMenu('/ui/project-1/data-marts/reports');

    const labels = screen.getAllByRole('link').map(link => link.textContent);

    expect(labels).toEqual([
      'Data Marts',
      'Reports',
      'Insights',
      'Triggers',
      'Run History',
      'Storages',
      'Destinations',
    ]);
    expect(
      screen.getByRole('link', { name: 'Reports' }).closest('[data-sidebar="menu-sub"]')
    ).not.toBeNull();
    expect(
      screen.getByRole('link', { name: 'Run History' }).closest('[data-sidebar="menu-sub"]')
    ).not.toBeNull();
  });

  it('does not open Data Mart sub-items just because the Data Marts item is selected', () => {
    renderMenu('/ui/project-1/data-marts');

    expect(screen.getByRole('link', { name: 'Data Marts' })).toHaveClass('bg-sidebar-active');
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });

  it('opens Data Mart sub-items from direct project-wide links', () => {
    renderMenu('/ui/project-1/data-marts/reports');

    expect(screen.getByRole('link', { name: 'Reports' })).toHaveClass('bg-sidebar-active');
  });

  it('keeps the Data Marts toggle button clickable without drawing a separator', () => {
    renderMenu('/ui/project-1/data-marts');

    const toggleButton = screen.getByRole('button', { name: 'Expand Data Marts' });

    expect(toggleButton).not.toHaveClass('border-l');
    expect(toggleButton.className).not.toContain('before:');
    expect(toggleButton).toHaveClass('cursor-pointer');
  });

  it('points the Data Marts toggle icon down when closed and up when open', () => {
    renderMenu('/ui/project-1/data-marts');

    const expandButton = screen.getByRole('button', { name: 'Expand Data Marts' });
    expect(expandButton.querySelector('svg')).not.toHaveClass('rotate-180');

    fireEvent.click(expandButton);

    expect(
      screen.getByRole('button', { name: 'Collapse Data Marts' }).querySelector('svg')
    ).toHaveClass('rotate-180');
  });

  it('persists manual Data Mart sub-menu open state between renders', () => {
    const { unmount } = renderMenu('/ui/project-1/data-marts');

    fireEvent.click(screen.getByRole('button', { name: 'Expand Data Marts' }));
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();

    unmount();
    renderMenu('/ui/project-1/data-marts');

    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Data Marts' }));
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });
});

function renderMenu(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <MainMenu />
      </SidebarProvider>
    </MemoryRouter>
  );
}
