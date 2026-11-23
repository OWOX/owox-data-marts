import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('saves and displays the new name and reloads the shared project list', async () => {
    enableCloudManagement();
    projectManagement.rename.mockResolvedValue({
      projectId: 'blocked-project',
      projectTitle: 'Revenue',
    });
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Edit project name' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), {
      target: { value: ' Revenue ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Revenue')).toBeVisible();
    expect(projectManagement.rename).toHaveBeenCalledWith(
      'https://ib.example.test',
      { userId: 'user-1', projectId: 'blocked-project' },
      'Revenue'
    );
    expect(projectsContext.value.loadProjects).toHaveBeenCalledWith({ force: true });
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
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();
  });

  it('opens the chosen remaining project through the existing sign-in flow', async () => {
    enableCloudManagement();
    const context = projectContext();
    context.projects.push(
      { id: 'next-project', title: 'Analytics', status: 'active', roles: ['viewer'] },
      { id: 'old-project', title: 'Removed project', status: 'removed', roles: ['admin'] }
    );
    projectsContext.value = context;
    projectManagement.delete.mockResolvedValue('removed');
    renderOverview();
    confirmDeletion();

    expect(await screen.findByText('Project deleted')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Removed project' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    expect(projectManagement.signIn).toHaveBeenCalledWith({
      projectId: 'next-project',
      redirect: '/ui/next-project/data-marts',
    });
  });

  it('continues without a target project when the last project is deleted', async () => {
    enableCloudManagement();
    projectManagement.delete.mockResolvedValue('removed');
    renderOverview();
    confirmDeletion();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(projectManagement.signIn).toHaveBeenCalledWith({ redirect: '/' });
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
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <OverviewTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
