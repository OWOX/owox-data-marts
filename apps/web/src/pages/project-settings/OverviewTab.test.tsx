import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectsContextType } from '../../features/idp/context/ProjectContext.types';
import type { User } from '../../features/idp/types';
import { RequestStatus } from '../../shared/types/request-status';
import { OverviewTab } from './OverviewTab';

const currentUser = vi.hoisted(() => ({
  value: {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['admin'],
    projectId: 'blocked-project',
    projectTitle: 'Blocked Project',
  } as User | null,
}));

const projectsContext = vi.hoisted(() => ({
  value: {} as ProjectsContextType,
}));

const clipboard = vi.hoisted(() => ({
  handleCopy: vi.fn(),
}));

const settingsFlags = vi.hoisted(() => ({
  value: {
    IDP_PROVIDER: 'owox-better-auth',
  } as Record<string, unknown>,
}));

const projectSettings = vi.hoisted(() => ({
  value: {
    settings: { description: 'Revenue means net revenue.' },
    isLoading: false,
    error: null as string | null,
    updateDescription: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../features/idp/hooks/useAuthState', () => ({
  useUser: () => currentUser.value,
}));

vi.mock('../../features/idp/hooks/useProjects', () => ({
  useProjects: () => projectsContext.value,
}));

vi.mock('../../features/idp/hooks/useRole', () => ({
  useIsAdmin: () => currentUser.value?.roles?.includes('admin') ?? false,
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
      ...currentUser.value!,
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
      ...currentUser.value!,
      mcpServerUrl: 'https://blocked-project.mcp.owox.com/mcp',
    };

    renderOverview();

    const mcpHeading = screen.getByText('MCP server');
    const legacyHeading = screen.getByText('Legacy platform settings');

    expect(
      Boolean(mcpHeading.compareDocumentPosition(legacyHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);
  });

  it('does not render a client-built MCP server URL when auth context has no URL', () => {
    currentUser.value = {
      ...currentUser.value!,
      mcpServerUrl: undefined,
    };

    renderOverview();

    expect(screen.queryByText('MCP server')).not.toBeInTheDocument();
    expect(screen.queryByText('https://blocked-project.mcp.owox.com/mcp')).not.toBeInTheDocument();
  });

  it('saves the project description with the same inline editor flow as a data mart', async () => {
    renderOverview();

    fireEvent.click(screen.getByText('Revenue means net revenue.'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '  Revenue excludes taxes.  ' } });
    fireEvent.blur(textarea);

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

    fireEvent.click(screen.getByText('Revenue means net revenue.'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

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
    <MemoryRouter>
      <OverviewTab />
    </MemoryRouter>
  );
}
