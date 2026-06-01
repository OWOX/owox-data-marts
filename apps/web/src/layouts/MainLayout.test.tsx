import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../features/idp/types';
import MainLayout from './MainLayout';

const currentUser = vi.hoisted(() => ({
  value: null as User | null,
}));

vi.mock('../features/idp', () => ({
  AuthGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/idp/components/ProjectIdGuard', () => ({
  ProjectIdGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/idp/components/ProjectRoleGuard', () => ({
  ProjectRoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/idp/hooks', () => ({
  useUser: () => currentUser.value,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => <div data-testid='full-app-sidebar'>Full app sidebar</div>,
}));

vi.mock('../components/AppSidebar/HelpMenu', () => ({
  HelpMenu: () => <div>Help</div>,
}));

vi.mock('../components/AppSidebar/UserMenu', () => ({
  UserMenu: () => <div>User menu</div>,
}));

vi.mock('../components/Logo', () => ({
  Logo: () => <span>Logo</span>,
}));

describe('MainLayout', () => {
  beforeEach(() => {
    currentUser.value = user([]);
  });

  it('renders the restricted project shell for users with empty project roles', () => {
    renderLayout();

    expect(screen.getByTestId('restricted-project-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('full-app-sidebar')).not.toBeInTheDocument();
    expect(screen.getByText('Access required')).toBeInTheDocument();
    expect(screen.getByText('Data Marts').closest('button')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText('Request access page')).toBeInTheDocument();
  });

  it('renders the regular app sidebar for users with project roles', () => {
    currentUser.value = user(['viewer']);

    renderLayout();

    expect(screen.getByTestId('full-app-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('restricted-project-sidebar')).not.toBeInTheDocument();
    expect(screen.getByText('Request access page')).toBeInTheDocument();
  });
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/request-access']}>
      <Routes>
        <Route path='/ui/:projectId' element={<MainLayout />}>
          <Route path='request-access' element={<div>Request access page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function user(roles: User['roles']): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    roles,
    projectId: 'project-1',
    projectTitle: 'Project 1',
  };
}
