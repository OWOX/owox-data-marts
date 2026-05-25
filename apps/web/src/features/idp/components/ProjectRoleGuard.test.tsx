import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import { ProjectRoleGuard } from './ProjectRoleGuard';

const authState = vi.hoisted(() => ({
  isLoading: false,
}));

const authUser = vi.hoisted(() => ({
  value: null as User | null,
}));

vi.mock('../hooks', () => ({
  useAuthState: () => authState,
  useUser: () => authUser.value,
}));

describe('ProjectRoleGuard', () => {
  beforeEach(() => {
    authState.isLoading = false;
    authUser.value = user([]);
  });

  it('redirects empty-role users to project request access with current URL as redirect target', () => {
    renderGuard('/ui/project-1/data-marts/create?draft=1#section');

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/ui/project-1/request-access?redirect-to=%2Fui%2Fproject-1%2Fdata-marts%2Fcreate%3Fdraft%3D1%23section'
    );
  });

  it('redirects users with roles away from project request access to safe target', () => {
    authUser.value = user(['viewer']);

    renderGuard('/ui/project-1/request-access?redirect-to=%2Fui%2Fproject-1%2Fdata-storages');

    expect(screen.getByTestId('location')).toHaveTextContent('/ui/project-1/data-storages');
  });

  it('renders children for users with roles outside request access page', () => {
    authUser.value = user(['admin']);

    renderGuard('/ui/project-1/data-marts');

    expect(screen.getByText('Guarded content')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/ui/project-1/data-marts');
  });
});

function renderGuard(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProjectRoleGuard>
        <div>Guarded content</div>
      </ProjectRoleGuard>
      <Routes>
        <Route path='*' element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  );
}

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid='location'>
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
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
