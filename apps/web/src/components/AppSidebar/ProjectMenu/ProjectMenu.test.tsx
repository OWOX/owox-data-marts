import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../../features/idp/types';
import { CloudProjectCreationProvider } from '../../../features/project-settings/management/CloudProjectCreationProvider';
import { SidebarProjectMenu } from './ProjectMenu';

const state = vi.hoisted(() => ({
  user: null as User | null,
  flags: { IDP_PROVIDER: '', CLOUD_PROJECT_API_ORIGIN: '' },
  create: vi.fn(),
  register: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('../../../app/store/hooks', () => ({ useFlags: () => ({ flags: state.flags }) }));
vi.mock('../../../features/idp/hooks/useAuthState', () => ({ useUser: () => state.user }));
vi.mock('../../../features/idp/hooks/useProjects', () => ({
  useProjects: () => ({ loadProjects: vi.fn() }),
}));
vi.mock('../../../features/idp/services', () => ({ signIn: state.signIn }));
vi.mock(
  '../../../features/project-settings/management/project-management.service',
  async original => ({
    ...(await original<
      typeof import('../../../features/project-settings/management/project-management.service')
    >()),
    createCloudProject: state.create,
    registerCloudProject: state.register,
    isCurrentProjectSession: () => true,
  })
);
vi.mock('./ProjectMenuTrigger', () => ({ ProjectMenuTrigger: () => null }));
vi.mock('./ProjectMenuContent', () => ({
  ProjectMenuContent: ({ createProjectItem }: { createProjectItem?: ReactNode }) =>
    createProjectItem,
}));
vi.mock('@owox/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled: boolean;
    onSelect: (event: Event) => void;
  }) => (
    <button
      disabled={disabled}
      onClick={event => {
        onSelect(event.nativeEvent);
      }}
    >
      {children}
    </button>
  ),
}));

describe('Create project in the sidebar', () => {
  beforeEach(() => {
    state.flags = {
      IDP_PROVIDER: 'owox-better-auth',
      CLOUD_PROJECT_API_ORIGIN: 'https://ib.example.test',
    };
    state.user = { id: 'user-1', projectId: 'requested-project', roles: [] };
    state.create.mockReset();
    state.register.mockReset();
    state.signIn.mockReset();
  });

  it('can create with no project role and retries opening without creating again', async () => {
    state.create.mockResolvedValue({ projectId: 'created-project', projectTitle: 'New project' });
    state.signIn.mockImplementationOnce(() => {
      throw new Error('Could not start sign-in');
    });
    render(<SidebarProjectMenu restricted />, { wrapper: CloudProjectCreationProvider });

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    const retry = await screen.findByRole('button', { name: 'Open new project' });
    await waitFor(() => {
      expect(retry).toBeEnabled();
    });
    fireEvent.click(retry);

    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.register).not.toHaveBeenCalled();
    expect(state.signIn).toHaveBeenCalledTimes(2);
    expect(state.signIn).toHaveBeenLastCalledWith({
      projectId: 'created-project',
      redirect: '/ui/created-project/data-marts',
    });
  });

  it('retries a failed registration with the existing ID', async () => {
    state.create.mockResolvedValueOnce({
      projectId: 'created-project',
      projectTitle: 'New project',
      registrationPending: true,
    });
    state.register.mockResolvedValueOnce({
      projectId: 'created-project',
      projectTitle: 'New project',
      registrationPending: false,
    });
    render(<SidebarProjectMenu />, { wrapper: CloudProjectCreationProvider });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry project setup' }));

    await waitFor(() => {
      expect(state.signIn).toHaveBeenCalledWith({
        projectId: 'created-project',
        redirect: '/ui/created-project/data-marts',
      });
    });
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.register).toHaveBeenCalledExactlyOnceWith(
      'https://ib.example.test',
      { userId: 'user-1', projectId: 'requested-project' },
      'created-project'
    );
  });

  it('shares the in-flight creation state between actions in the same layout', () => {
    state.create.mockReturnValue(new Promise(() => undefined));
    render(
      <>
        <SidebarProjectMenu />
        <SidebarProjectMenu />
      </>,
      { wrapper: CloudProjectCreationProvider }
    );

    const [first, second] = screen.getAllByRole('button', { name: 'Create project' });
    fireEvent.click(first);

    expect(second).toBeDisabled();
    fireEvent.click(second);
    expect(state.create).toHaveBeenCalledTimes(1);
  });

  it.each(['view-only', 'better-auth', 'none'])('hides creation for %s', scenario => {
    if (scenario === 'view-only') state.user = { ...state.user!, viewOnly: true };
    else state.flags.IDP_PROVIDER = scenario;
    render(<SidebarProjectMenu />, { wrapper: CloudProjectCreationProvider });
    expect(screen.queryByRole('button', { name: 'Create project' })).not.toBeInTheDocument();
  });
});
