import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setProject } from '../../app/store/reducers/project.reducer';
import type { ProjectsContextType } from '../../features/idp/context/ProjectContext.types';
import type { User } from '../../features/idp/types';
import { RequestStatus } from '../../shared/types/request-status';
import { dataStorageApiService } from '../../features/data-storage/shared/api/data-storage-api.service';
import { OverviewTab } from './OverviewTab';

const currentUser = vi.hoisted<{ value: User }>(() => ({
  value: {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['admin'],
    projectId: 'blocked-project',
    projectTitle: 'Blocked Project',
  },
}));

const projectsContext = vi.hoisted(() => ({
  value: {} as ProjectsContextType,
}));

const projectManagement = vi.hoisted(() => ({
  rename: vi.fn(),
  delete: vi.fn(),
  dispatch: vi.fn(),
  signIn: vi.fn(),
  showDeleted: vi.fn(),
  showUnavailable: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: projectManagement.showDeleted, info: projectManagement.showUnavailable },
}));

vi.mock(
  '../../features/project-settings/management/project-management.service',
  async original => ({
    ...(await original<
      typeof import('../../features/project-settings/management/project-management.service')
    >()),
    renameCloudProject: projectManagement.rename,
    deleteCloudProject: projectManagement.delete,
    isCurrentProjectSession: () => true,
  })
);

vi.mock('../../app/store/core/store-hooks', () => ({
  useAppDispatch: () => projectManagement.dispatch,
}));
vi.mock('../../features/idp/services', async original => ({
  ...(await original<typeof import('../../features/idp/services')>()),
  signIn: projectManagement.signIn,
}));

const clipboard = vi.hoisted(() => ({
  handleCopy: vi.fn(),
}));

const settingsFlags = vi.hoisted<{ value: Record<string, unknown> }>(() => ({
  value: {
    IDP_PROVIDER: 'owox-better-auth',
  },
}));

const projectSettings = vi.hoisted(() => ({
  value: {
    settings: { description: 'Revenue means net revenue.' },
    isLoading: false,
    error: null as string | null,
    updateDescription: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
    />
  ),
}));
vi.mock('../../shared/services/markdown.service', () => ({
  parseMarkdownToHtml: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../features/idp/hooks/useAuthState', () => ({
  useUser: () => currentUser.value,
}));

vi.mock('../../features/idp/hooks/useProjects', () => ({
  useProjects: () => projectsContext.value,
}));

vi.mock('../../features/idp/hooks/useRole', () => ({
  useIsAdmin: () => currentUser.value.roles?.includes('admin') ?? false,
}));

vi.mock('../../features/project-settings/overview', () => ({
  useProjectSettings: () => projectSettings.value,
}));

vi.mock('../../app/store/hooks', () => ({
  useFlags: () => ({ flags: settingsFlags.value }),
}));

vi.mock('../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/blocked-project${path}` }),
}));

vi.mock('../../features/project-settings/members/model/members-settings.context', () => ({
  useMembersSettings: () => ({ members: [] }),
}));

vi.mock('../../features/data-marts/shared/services/data-mart.service', () => ({
  dataMartService: { getDataMarts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../features/data-storage/shared/api/data-storage-api.service', () => ({
  dataStorageApiService: { getDataStorages: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../features/data-destination/shared/services/data-destination.service', () => ({
  dataDestinationService: { getDataDestinations: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../features/contexts/services/context.service', () => ({
  contextService: { getContexts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../hooks/useClipboard', () => ({
  useClipboard: () => ({
    copiedSection: null,
    handleCopy: clipboard.handleCopy,
  }),
}));

describe('OverviewTab project status', () => {
  beforeEach(() => {
    currentUser.value = {
      id: 'user-1',
      email: 'user@example.com',
      roles: ['admin'],
      projectId: 'blocked-project',
      projectTitle: 'Blocked Project',
    };
    projectsContext.value = projectContext();
    clipboard.handleCopy.mockClear();
    projectManagement.rename.mockReset();
    projectManagement.delete.mockReset();
    projectManagement.dispatch.mockReset();
    projectManagement.signIn.mockReset();
    projectManagement.showDeleted.mockClear();
    projectManagement.showUnavailable.mockClear();
    settingsFlags.value = {
      IDP_PROVIDER: 'owox-better-auth',
    };
    projectSettings.value = {
      settings: { description: 'Revenue means net revenue.' },
      isLoading: false,
      error: null,
      updateDescription: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('shows DuckDB storages as DuckDB', async () => {
    vi.mocked(dataStorageApiService.getDataStorages).mockResolvedValueOnce([
      { id: 'storage-1', type: 'DUCKDB' },
    ] as Awaited<ReturnType<typeof dataStorageApiService.getDataStorages>>);

    renderOverview();

    expect(await screen.findByText('DuckDB')).toBeInTheDocument();
  });

  it('renders blocked status for the current project from project list', () => {
    renderOverview();

    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('loads projects when the project list has not been loaded yet', () => {
    const loadProjects = vi.fn();
    projectsContext.value = projectContext({
      projects: [],
      callState: RequestStatus.IDLE,
      loadProjects,
    });

    renderOverview();

    expect(loadProjects).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });

  it('renders and copies the project-specific MCP server URL from auth context', () => {
    const mcpServerUrl = 'https://blocked-project.mcp.owox.com/mcp';
    currentUser.value = {
      ...currentUser.value,
      mcpServerUrl,
    };

    renderOverview();

    expect(screen.getByText('MCP server')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more about project settings' })).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/project/'
    );
    expect(screen.getByText(mcpServerUrl)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: mcpServerUrl })).not.toBeInTheDocument();
    expect(
      screen.getByText(/For a single-project setup, use the published OWOX MCP server/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/For multi-project workflows, use this project-specific URL/i)
    ).toBeInTheDocument();

    const setupGuideLink = screen.getByRole('link', { name: 'MCP setup guide' });
    expect(setupGuideLink).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/getting-started/setup-guide/mcp/'
    );

    fireEvent.click(screen.getByTitle('Copy project-mcp-url to clipboard'));

    expect(clipboard.handleCopy).toHaveBeenCalledWith(mcpServerUrl, 'project-mcp-url');
  });

  it('renders MCP server settings before legacy platform settings', () => {
    currentUser.value = {
      ...currentUser.value,
      mcpServerUrl: 'https://blocked-project.mcp.owox.com/mcp',
    };

    renderOverview();

    const mcpHeading = screen.getByText('MCP server');
    const legacyHeading = screen.getByText('Legacy platform settings');

    expect(
      Boolean(mcpHeading.compareDocumentPosition(legacyHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);
  });

  it.each(['Revenue_2026 → [EU]*, Inc. - (test)!', '→'.repeat(255)])(
    'saves an Analytics-compatible name and reloads the shared project list',
    async title => {
      enableCloudManagement();
      projectManagement.rename.mockResolvedValue({
        projectId: 'blocked-project',
        projectTitle: title,
      });
      renderOverview();

      fireEvent.click(screen.getByRole('button', { name: 'Edit project name' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), {
        target: { value: ` ${title} ` },
      });
      const save = screen.getByRole('button', { name: 'Save' });
      await waitFor(() => {
        expect(save).toBeEnabled();
      });
      fireEvent.click(save);

      expect(await screen.findByText(title)).toBeVisible();
      expect(projectManagement.rename).toHaveBeenCalledWith(
        'https://ib.example.test',
        { userId: 'user-1', projectId: 'blocked-project' },
        title
      );
      expect(projectManagement.dispatch).toHaveBeenCalledWith(
        setProject({ id: 'blocked-project', title })
      );
      expect(projectsContext.value.loadProjects).toHaveBeenCalledWith({ force: true });
    }
  );

  it.each([
    ['   ', 'Enter a project name.'],
    ['a'.repeat(256), 'Use up to 255 characters.'],
    ['Доход', 'Use English letters, numbers, spaces'],
    ['Revenue & Costs', 'Use English letters, numbers, spaces'],
    ['\u00a0Revenue', 'Use English letters, numbers, spaces'],
  ])('rejects an invalid project name before calling IB', async (title, message) => {
    enableCloudManagement();
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Edit project name' }));
    const input = screen.getByRole('textbox', { name: 'Project name' });
    fireEvent.change(input, { target: { value: title } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveAttribute('data-slot', 'form-message');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(projectManagement.rename).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'Use up to 255 characters.'],
    [401, 'Sign in again to change the project name.'],
    [403, 'You do not have permission to rename this project.'],
    [404, 'This project is no longer available.'],
    [409, 'This project is being removed. Its name cannot be changed.'],
    [502, 'Could not save the project name. Try again.'],
  ])('shows an actionable error after IB returns %s', async (status, message) => {
    enableCloudManagement();
    projectManagement.rename.mockRejectedValue({ isAxiosError: true, response: { status } });
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Edit project name' }));
    const input = screen.getByRole('textbox', { name: 'Project name' });
    fireEvent.change(input, { target: { value: 'Updated project' } });
    const save = screen.getByRole('button', { name: 'Save' });
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
    fireEvent.click(save);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveValue('Updated project');
    expect(input).toHaveAttribute('aria-invalid', String(status === 400));
    expect(projectManagement.dispatch).not.toHaveBeenCalled();
  });

  it.each(['no-origin', 'self-hosted', 'viewer', 'view-only'])(
    'hides project name and deletion controls in the %s case',
    scenario => {
      if (scenario !== 'no-origin') enableCloudManagement();
      if (scenario === 'self-hosted') settingsFlags.value.IDP_PROVIDER = 'better-auth';
      if (scenario === 'viewer') currentUser.value = { ...currentUser.value, roles: ['viewer'] };
      if (scenario === 'view-only') currentUser.value = { ...currentUser.value, viewOnly: true };
      renderOverview();
      expect(screen.queryByRole('button', { name: 'Edit project name' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();
    }
  );

  it('keeps a project with pending deletion on Overview', async () => {
    enableCloudManagement();
    projectManagement.delete.mockResolvedValue('removing');
    renderOverview();
    confirmDeletion();

    expect(await screen.findByText('Removing')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete project' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'My projects' })).not.toBeInTheDocument();
    expect(projectManagement.signIn).not.toHaveBeenCalled();
  });

  it('shows Removing after reload from the project list', () => {
    enableCloudManagement();
    projectsContext.value = projectContext({
      projects: [
        {
          id: 'blocked-project',
          title: 'Blocked Project',
          status: 'blocked',
          removalPending: true,
        },
      ],
    });
    renderOverview();
    expect(screen.getByText('Removing')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete project' })).toBeEnabled();
  });

  it('explains outstanding billing and lets the admin retry the deletion', async () => {
    enableCloudManagement();
    projectManagement.delete
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 409, data: { code: 'PROJECT_BILLING_OUTSTANDING' } },
      })
      .mockResolvedValueOnce('removed');
    renderOverview();
    confirmDeletion();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Settle any open invoices or negative balance');
    expect(screen.queryByText('Removing')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(await screen.findByRole('heading', { name: 'My projects' })).toBeVisible();
    expect(projectManagement.delete).toHaveBeenCalledTimes(2);
  });

  it.each([
    { scenario: 'other projects', remaining: true, profileEnabled: true, heading: 'My projects' },
    {
      scenario: 'the last project',
      remaining: false,
      profileEnabled: true,
      heading: 'My profile',
    },
    {
      scenario: 'the last project with profile disabled',
      remaining: false,
      profileEnabled: false,
      heading: 'My projects',
    },
  ])('opens $heading after deleting $scenario', async ({ remaining, profileEnabled, heading }) => {
    enableCloudManagement();
    if (profileEnabled) settingsFlags.value.CLOUD_ACCOUNT_API_ORIGIN = 'https://ib.example.test';
    if (remaining) {
      projectsContext.value.projects.push({
        id: 'next-project',
        title: 'Analytics',
        status: 'active',
        roles: ['viewer'],
      });
    }
    projectManagement.delete.mockResolvedValue('removed');
    renderOverview();
    confirmDeletion();

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(projectsContext.value.loadProjects).toHaveBeenCalledWith({ force: true });
    expect(projectManagement.signIn).not.toHaveBeenCalled();
  });

  it('waits for the refreshed project list before deciding where to go', async () => {
    enableCloudManagement();
    settingsFlags.value.CLOUD_ACCOUNT_API_ORIGIN = 'https://ib.example.test';
    vi.mocked(projectsContext.value.loadProjects).mockImplementationOnce(async () => {
      projectsContext.value.callState = RequestStatus.LOADING;
    });
    projectManagement.delete.mockResolvedValue('removed');
    const { rerender } = renderOverview();
    confirmDeletion();

    expect(await screen.findByText('Loading projects…')).toBeVisible();
    projectsContext.value = projectContext({
      projects: [{ id: 'next-project', title: 'Analytics', status: 'active', roles: ['viewer'] }],
    });
    rerender(<OverviewTestRoutes />);

    expect(await screen.findByRole('heading', { name: 'My projects' })).toBeVisible();
  });

  it('refreshes after an uncertain delete and opens Projects without claiming it was deleted', async () => {
    enableCloudManagement();
    vi.mocked(projectsContext.value.loadProjects).mockImplementationOnce(async () => {
      projectsContext.value.callState = RequestStatus.LOADING;
    });
    projectManagement.delete.mockRejectedValue(new Error('Request timed out'));
    const { rerender } = renderOverview();
    confirmDeletion();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm deletion');
    expect(projectsContext.value.loadProjects).toHaveBeenCalledWith({ force: true });

    projectsContext.value = projectContext({
      projects: [{ id: 'next-project', title: 'Analytics', status: 'active' }],
    });
    rerender(<OverviewTestRoutes />);

    expect(await screen.findByRole('heading', { name: 'My projects' })).toBeVisible();
    expect(projectManagement.showUnavailable).toHaveBeenCalledWith(
      'This project is no longer available.'
    );
    expect(projectManagement.showDeleted).not.toHaveBeenCalled();
  });

  it('does not render a client-built MCP server URL when auth context has no URL', () => {
    currentUser.value = {
      ...currentUser.value,
      mcpServerUrl: undefined,
    };

    renderOverview();

    expect(screen.queryByText('MCP server')).not.toBeInTheDocument();
    expect(screen.queryByText('https://blocked-project.mcp.owox.com/mcp')).not.toBeInTheDocument();
  });

  it('renders project description as a separate collapsible block after At a glance', () => {
    renderOverview();

    const atAGlanceHeading = screen.getByText('At a glance');
    const descriptionHeading = screen.getByText('Description');

    expect(
      Boolean(
        atAGlanceHeading.compareDocumentPosition(descriptionHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(screen.getByText(/business goals, terminology, and conventions/i)).toBeInTheDocument();
  });

  it('saves the project description with the same inline editor flow as a data mart', async () => {
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '  Revenue excludes taxes.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(projectSettings.value.updateDescription).toHaveBeenCalledWith(
        'Revenue excludes taxes.'
      );
    });
  });

  it('shows the project description as read-only to non-admin users', () => {
    currentUser.value = {
      id: 'user-2',
      roles: ['viewer'],
      projectId: 'blocked-project',
      projectTitle: 'Blocked Project',
    };
    renderOverview();

    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

function enableCloudManagement() {
  settingsFlags.value.CLOUD_PROJECT_API_ORIGIN = 'https://ib.example.test';
}

function confirmDeletion() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));
}

function projectContext(overrides: Partial<ProjectsContextType> = {}): ProjectsContextType {
  return {
    projects: [
      {
        id: 'blocked-project',
        title: 'Blocked Project',
        status: 'blocked',
      },
    ],
    callState: RequestStatus.LOADED,
    error: null,
    isLoading: false,
    loadProjects: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  } as unknown as ProjectsContextType;
}

function renderOverview() {
  const client = new QueryClient();
  return render(<OverviewTestRoutes />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
}

function OverviewTestRoutes() {
  return (
    <Routes>
      <Route path='/' element={<OverviewTab />} />
      <Route path='/ui/me/projects' element={<h1>My projects</h1>} />
      <Route path='/ui/me/profile' element={<h1>My profile</h1>} />
    </Routes>
  );
}
