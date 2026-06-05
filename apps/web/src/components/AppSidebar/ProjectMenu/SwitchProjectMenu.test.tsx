import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import { SwitchProjectMenu } from './SwitchProjectMenu';

const projectsState = vi.hoisted(() => ({
  value: {
    projects: [] as { id: string; title: string }[],
    callState: 'idle' as RequestStatus,
    error: null as Error | null,
    isLoading: false,
    loadProjects: vi.fn(),
    reset: vi.fn(),
  },
}));

const authState = vi.hoisted(() => ({
  value: {
    user: {
      projectId: 'project-1',
    },
  },
}));

vi.mock('../../../features/idp', () => ({
  useAuth: () => authState.value,
}));

vi.mock('../../../features/idp/hooks/useProjects.ts', () => ({
  useProjects: () => projectsState.value,
}));

vi.mock('@owox/ui/components/dropdown-menu', () => ({
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <div aria-disabled={disabled ? 'true' : undefined} onClick={onClick}>
      {children}
    </div>
  ),
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => <hr />,
}));

describe('SwitchProjectMenu', () => {
  beforeEach(() => {
    projectsState.value = {
      projects: [],
      callState: RequestStatus.IDLE,
      error: null,
      isLoading: false,
      loadProjects: vi.fn(),
      reset: vi.fn(),
    };
    authState.value = {
      user: {
        projectId: 'project-1',
      },
    };
  });

  it('loads projects and shows loading state when auto-load starts from idle', async () => {
    renderSwitchProjectMenu(<SwitchProjectMenu autoLoad />);

    expect(screen.getByText('Loading projects...')).toBeInTheDocument();

    await waitFor(() => {
      expect(projectsState.value.loadProjects).toHaveBeenCalledTimes(1);
    });
  });

  it('shows empty message when only the current project is available in restricted mode', () => {
    projectsState.value = {
      ...projectsState.value,
      projects: [{ id: 'project-1', title: 'Current Project' }],
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(
      <SwitchProjectMenu
        emptyMessage='No other projects available'
        excludeCurrentProject
        showSeparator={false}
      />
    );

    expect(screen.getByText('Switch project')).toBeInTheDocument();
    expect(screen.getByText('No other projects available')).toBeInTheDocument();
    expect(screen.queryByText('Current Project')).not.toBeInTheDocument();
  });

  it('shows only alternative projects in restricted mode', () => {
    projectsState.value = {
      ...projectsState.value,
      projects: [
        { id: 'project-1', title: 'Current Project' },
        { id: 'project-2', title: 'Project 2' },
      ],
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(
      <SwitchProjectMenu
        emptyMessage='No other projects available'
        excludeCurrentProject
        showSeparator={false}
      />
    );

    expect(screen.getByText('Project 2')).toBeInTheDocument();
    expect(screen.queryByText('Current Project')).not.toBeInTheDocument();
    expect(screen.queryByText('No other projects available')).not.toBeInTheDocument();
  });
});

function renderSwitchProjectMenu(children: ReactNode) {
  render(<MemoryRouter>{children}</MemoryRouter>);
}
