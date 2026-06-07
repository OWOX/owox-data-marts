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
    ['Run History', '/ui/project-1/data-marts/runs'],
    ['Triggers', '/ui/project-1/data-marts/schedules'],
    ['Reports', '/ui/project-1/data-marts/reports'],
    ['Insights', '/ui/project-1/data-marts/insights'],
  ])('marks the project-wide %s item active without also activating Data Marts', (label, path) => {
    renderMenu(path);

    expect(screen.getByRole('link', { name: label })).toHaveClass('bg-sidebar-active');
    expect(screen.getByRole('link', { name: 'Data Marts' })).not.toHaveClass('bg-sidebar-active');
  });

  it('keeps project-wide Data Mart items at the end in tab order', () => {
    renderMenu('/ui/project-1/data-marts');

    const labels = screen.getAllByRole('link').map(link => link.textContent);

    expect(labels).toEqual([
      'Data Marts',
      'Storages',
      'Destinations',
      'Triggers',
      'Reports',
      'Insights',
      'Run History',
    ]);
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
