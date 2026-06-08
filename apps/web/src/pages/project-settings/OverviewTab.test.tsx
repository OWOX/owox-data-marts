import { render, screen } from '@testing-library/react';
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

vi.mock('../../features/idp/hooks/useAuthState', () => ({
  useUser: () => currentUser.value,
}));

vi.mock('../../features/idp/hooks/useProjects', () => ({
  useProjects: () => projectsContext.value,
}));

vi.mock('../../app/store/hooks', () => ({
  useFlags: () => ({ flags: {} }),
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
    handleCopy: vi.fn(),
  }),
}));

describe('OverviewTab project status', () => {
  beforeEach(() => {
    projectsContext.value = projectContext();
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
