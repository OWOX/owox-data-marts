import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@owox/ui/components/sidebar';
import { describe, expect, it, vi } from 'vitest';
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
  it.each([
    ['Models', '/ui/project-1/data-marts/models'],
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
      'Models',
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

  it('always shows Data Mart sub-items when the Data Marts item is selected', () => {
    renderMenu('/ui/project-1/data-marts');

    expect(screen.getByRole('link', { name: 'Data Marts' })).toHaveClass('bg-sidebar-active');
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Data Marts/ })).not.toBeInTheDocument();
  });

  it('opens Data Mart sub-items from direct project-wide links', () => {
    renderMenu('/ui/project-1/data-marts/reports');

    expect(screen.getByRole('link', { name: 'Reports' })).toHaveClass('bg-sidebar-active');
  });

  it('keeps the production active background instead of SidebarMenu data-active accent', () => {
    renderMenu('/ui/project-1/data-marts/reports');

    const activeProjectItem = screen.getByRole('link', { name: 'Reports' });
    const inactiveParentItem = screen.getByRole('link', { name: 'Data Marts' });

    expect(activeProjectItem).toHaveClass(
      'bg-sidebar-active',
      'text-sidebar-active-foreground',
      'shadow-sm'
    );
    expect(activeProjectItem).not.toHaveAttribute('data-active', 'true');
    expect(inactiveParentItem).not.toHaveAttribute('data-active', 'true');
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
