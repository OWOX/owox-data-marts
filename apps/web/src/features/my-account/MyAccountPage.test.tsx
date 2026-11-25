import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../shared/types/request-status';
import { UserMenu } from '../../components/AppSidebar/UserMenu';
import type { Project } from '../idp/types';
import {
  CloudProjectCreationProvider,
  CloudProjectListRefresh,
} from '../project-settings/management/CloudProjectCreationProvider';
import { MyAccountPage } from './MyAccountPage';

const useFlags = vi.hoisted(() => vi.fn());
const request = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const loadProjects = vi.hoisted(() => vi.fn());
vi.mock('../../app/api/apiClient', () => ({ default: { request, post } }));
vi.mock('../../app/api/token-provider', () => ({
  getTokenProvider: () => ({
    getUserId: () => 'account-1',
    getProjectId: () => 'project-1',
    getAccessToken: () => 'interactive-app-token',
  }),
}));
vi.mock('../idp/services', () => ({ signIn }));
const auth = vi.hoisted(() => ({ viewOnly: false }));
const projectList: Project[] = [
  { id: 'project-2', title: 'Marketing', roles: ['viewer'], status: 'active' },
  { id: 'project-3', title: 'Sales analytics', roles: ['editor', 'admin'], status: 'blocked' },
];
let projects: Project[];
const getUser = () => ({
  id: 'account-1',
  projectId: 'project-1',
  roles: [],
  viewOnly: auth.viewOnly,
});

vi.mock('../../app/store/hooks', () => ({ useFlags }));
vi.mock('../idp/hooks/useProjects', () => ({
  useProjects: () => ({
    callState: RequestStatus.LOADED,
    loadProjects,
    projects,
  }),
}));
vi.mock('../idp/hooks', () => ({
  useAuth: () => ({
    user: { fullName: 'Anna', email: 'anna@example.test', roles: [] },
    signOut: vi.fn(),
  }),
}));
vi.mock('../idp/hooks/useAuthState', () => ({
  useUser: () => getUser(),
  useAuthState: () => ({
    isAuthenticated: true,
    session: { accessToken: 'interactive-app-token' },
    user: getUser(),
  }),
}));

function renderProfile(initialPath = '/ui/me/profile', deletedProjectId?: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CloudProjectCreationProvider>
        <CloudProjectListRefresh />
        <MemoryRouter initialEntries={[{ pathname: initialPath, state: { deletedProjectId } }]}>
          <Routes>
            <Route path='/ui/me/profile' element={<MyAccountPage />} />
            <Route path='/ui/me/projects' element={<MyAccountPage section='projects' />} />
            <Route
              path='/ui/me/email-preferences'
              element={<MyAccountPage section='email-preferences' />}
            />
            <Route path='/ui/project-1/request-access' element={<UserMenu />} />
            <Route path='/' element={<h1>Home</h1>} />
          </Routes>
        </MemoryRouter>
      </CloudProjectCreationProvider>
    </QueryClientProvider>
  );
}

describe('My profile', () => {
  const profile = {
    fullName: 'Anna Kowalska',
    email: 'anna@example.test',
    workEmail: 'anna@company.test',
    phone: '',
    companyName: 'Example Company',
    companyWebsite: '',
    erasureRequest: null,
  };

  function enableCloud(projectManagement = false) {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: {
        IDP_PROVIDER: 'owox-better-auth',
        CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
        ...(projectManagement && { CLOUD_PROJECT_API_ORIGIN: 'https://ib.example.test' }),
      },
    });
  }

  beforeEach(() => {
    sessionStorage.clear();
    request.mockReset();
    post.mockReset();
    signIn.mockReset();
    loadProjects.mockReset();
    projects = projectList;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useFlags.mockReset();
    auth.viewOnly = false;
  });

  it('reads and displays the personal profile through the shared client with empty project roles', async () => {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: {
        IDP_PROVIDER: 'owox-better-auth',
        CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
      },
    });
    request.mockResolvedValue({ data: profile });

    renderProfile('/ui/project-1/request-access');
    fireEvent.keyDown(screen.getByRole('button', { name: /Anna/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'My profile' }));

    expect(await screen.findByText('Anna Kowalska')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Request access' })).toHaveAttribute(
      'href',
      '/ui/project-1/request-access'
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/account/me',
        baseURL: 'https://ib.example.test',
        expectedSession: { userId: 'account-1', projectId: 'project-1' },
        withCredentials: false,
        skipErrorToast: true,
        skipLogoutOnUnauthorizedRetry: true,
      })
    );
  });

  it.each(['better-auth', 'none'])('does not call the Cloud API under %s', async provider => {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: { IDP_PROVIDER: provider, CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test' },
    });

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it('shows roles from each project rather than the empty roles of the current project', async () => {
    enableCloud();
    request.mockResolvedValue({ data: profile });

    renderProfile();
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    const table = within(await screen.findByRole('table', { name: 'My projects' }));
    expect(table.getByRole('row', { name: /Marketing Active Business User/ })).toBeVisible();
    expect(
      table.getByRole('row', { name: /Sales analytics Blocked Data Owner, Project Admin/ })
    ).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText('Search projects'), {
      target: { value: 'Sales' },
    });
    expect(table.queryByText('Marketing')).not.toBeInTheDocument();
    expect(table.getByText('Sales analytics')).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Search projects'), {
      target: { value: 'No matching project' },
    });
    expect(table.getByText('No projects found.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create project' })).not.toBeInTheDocument();
  });

  it('creates a project from the empty list with no project roles', async () => {
    enableCloud(true);
    projects = [];
    post.mockResolvedValue({ data: { projectId: 'new-project', projectTitle: 'New project' } });
    renderProfile('/ui/me/projects', 'project-1');

    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/api/bi-projects',
      undefined,
      expect.objectContaining({
        baseURL: 'https://ib.example.test',
        expectedSession: { userId: 'account-1', projectId: 'project-1' },
      })
    );
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith({
        projectId: 'new-project',
        redirect: '/ui/new-project/data-marts',
      });
    });
  });

  it('shows Removing for a project with a pending removal', async () => {
    enableCloud();
    projects = [{ id: 'pending', title: 'Pending', status: 'blocked', removalPending: true }];
    renderProfile('/ui/me/projects');
    expect(await screen.findByRole('row', { name: /Pending Removing/ })).toBeVisible();
  });

  it('offers to retry setup with the same ID once the new project appears in the list', async () => {
    enableCloud(true);
    projects = [];
    const project = { projectId: 'new-project', projectTitle: 'New project' };
    post
      .mockResolvedValueOnce({ data: { ...project, registrationPending: true } })
      .mockResolvedValueOnce({ data: project });
    loadProjects.mockImplementation(() => {
      projects = [{ id: project.projectId, title: project.projectTitle, status: 'active' }];
      return Promise.resolve();
    });
    renderProfile('/ui/me/projects', 'project-1');

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('table', { name: 'My projects' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry project setup' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledOnce();
    });
    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/api/bi-projects',
      '/api/bi-projects/new-project/registration',
    ]);
  });

  it.each(['disabled', 'view-only'])('hides the creation action when %s', scenario => {
    auth.viewOnly = scenario === 'view-only';
    enableCloud(auth.viewOnly);
    projects = [];
    renderProfile('/ui/me/projects');

    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create project' })).not.toBeInTheDocument();
  });

  it('shows the projects table after deletion without a link back to the deleted project', async () => {
    enableCloud();
    renderProfile('/ui/me/projects', 'project-1');

    expect(await screen.findByRole('table', { name: 'My projects' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Back to/ })).not.toBeInTheDocument();
  });

  it('shows Projects with Cloud project management enabled and no profile API origin', async () => {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: {
        IDP_PROVIDER: 'owox-better-auth',
        CLOUD_PROJECT_API_ORIGIN: 'https://ib.example.test',
      },
    });
    renderProfile('/ui/me/projects');

    expect(await screen.findByRole('table', { name: 'My projects' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email preferences' })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('saves a personal email preference without project roles', async () => {
    enableCloud();
    request
      .mockResolvedValueOnce({ data: { topics: [{ id: 'Offers', subscribed: true }] } })
      .mockResolvedValueOnce({ status: 204, data: undefined })
      .mockResolvedValueOnce({ data: { topics: [{ id: 'Offers', subscribed: false }] } });
    renderProfile('/ui/me/email-preferences');

    const offers = await screen.findByRole('switch', { name: 'Offers' });
    expect(offers).toBeChecked();
    fireEvent.click(offers);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Offers' })).not.toBeChecked();
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: '/api/account/me/email-preferences/Offers',
        method: 'PATCH',
        data: { subscribed: false },
      })
    );
  });

  it('shows email preferences as read-only while viewing another account', async () => {
    enableCloud();
    auth.viewOnly = true;
    request.mockResolvedValue({ data: { topics: [{ id: 'Offers', subscribed: false }] } });
    renderProfile('/ui/me/email-preferences');

    const offers = await screen.findByRole('switch', { name: 'Offers' });
    expect(offers).toBeDisabled();
    fireEvent.click(offers);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('lets an empty-role session edit its own profile without changing the sign-in email', async () => {
    enableCloud();
    request
      .mockResolvedValueOnce({ data: profile })
      .mockResolvedValueOnce({ data: { ...profile, fullName: 'Anna Nowak' } });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('Sign-in email')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Anna Nowak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Anna Nowak')).toBeVisible();
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/api/account/me',
        method: 'PATCH',
        data: { fullName: 'Anna Nowak' },
      })
    );
  });

  it('submits and cancels the pending erasure request using the displayed request ID', async () => {
    enableCloud();
    request
      .mockResolvedValueOnce({ data: profile })
      .mockResolvedValueOnce({ status: 204, data: undefined })
      .mockResolvedValueOnce({
        data: {
          ...profile,
          erasureRequest: { id: 'request-1', status: 'pending' },
        },
      })
      .mockResolvedValueOnce({ status: 204, data: undefined })
      .mockResolvedValueOnce({ data: profile });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Request profile deletion' }));
    fireEvent.click(screen.getByRole('button', { name: /^Request deletion$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel deletion request' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request profile deletion' })).toBeVisible();
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/account/me/erasure-request', method: 'POST' })
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/account/me/erasure-request/request-1',
        method: 'DELETE',
      })
    );
  });

  it.each([null, { id: 'request-1', status: 'pending' }])(
    'hides all account mutations in view-only mode',
    async erasureRequest => {
      enableCloud();
      auth.viewOnly = true;
      request.mockResolvedValue({ data: { ...profile, erasureRequest } });

      renderProfile();

      expect(await screen.findByText('Anna Kowalska')).toBeVisible();
      expect(screen.getByText(/viewing this profile in read-only mode/)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Request profile deletion' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Cancel deletion request' })
      ).not.toBeInTheDocument();
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
});
