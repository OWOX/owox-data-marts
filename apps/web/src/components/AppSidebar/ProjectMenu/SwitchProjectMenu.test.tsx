import type { ReactNode } from 'react';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import { SwitchProjectMenu } from './SwitchProjectMenu';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

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
  DropdownMenuSubContent: ({
    children,
    onKeyDown,
  }: {
    children: ReactNode;
    onKeyDown?: React.KeyboardEventHandler;
  }) => <div onKeyDown={onKeyDown}>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
    onPointerEnter,
    onPointerLeave,
    className,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    className?: string;
    [key: string]: unknown;
  }) => (
    <div
      aria-disabled={disabled ? 'true' : undefined}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={className}
    >
      {children}
    </div>
  ),
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => <hr />,
}));

describe('SwitchProjectMenu', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
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

  it('does not display search input when there are 10 or fewer projects', () => {
    const testProjects = Array.from({ length: 10 }, (_, i) => ({
      id: `project-${i + 1}`,
      title: `Project ${i + 1}`,
    }));
    projectsState.value = {
      ...projectsState.value,
      projects: testProjects,
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(<SwitchProjectMenu />);

    expect(screen.queryByPlaceholderText('Search project...')).not.toBeInTheDocument();
  });

  it('displays search input when there are more than 10 projects', () => {
    const testProjects = Array.from({ length: 11 }, (_, i) => ({
      id: `project-${i + 1}`,
      title: `Project ${i + 1}`,
    }));
    projectsState.value = {
      ...projectsState.value,
      projects: testProjects,
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(<SwitchProjectMenu />);

    expect(screen.getByPlaceholderText('Search project...')).toBeInTheDocument();
  });

  it('filters projects based on search query', () => {
    const testProjects = Array.from({ length: 12 }, (_, i) => ({
      id: `project-${i + 1}`,
      title: `Project ${i + 1}`,
    }));
    projectsState.value = {
      ...projectsState.value,
      projects: testProjects,
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(<SwitchProjectMenu />);

    const searchInput = screen.getByPlaceholderText('Search project...');
    expect(screen.getByText('Project 1')).toBeInTheDocument();
    expect(screen.getByText('Project 11')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Project 11' } });

    expect(screen.getByText('Project 11')).toBeInTheDocument();
    expect(screen.queryByText('Project 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Project 2')).not.toBeInTheDocument();
  });

  it('navigates to selected project on Enter key press', () => {
    const testProjects = Array.from({ length: 3 }, (_, i) => ({
      id: `project-${i + 1}`,
      title: `Project ${i + 1}`,
    }));
    projectsState.value = {
      ...projectsState.value,
      projects: testProjects,
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(<SwitchProjectMenu />);

    const projectList = screen.getByTestId('project-list');

    // Simulate ArrowDown to move to first item, then Enter to navigate
    fireEvent.keyDown(projectList, { key: 'ArrowDown' });
    fireEvent.keyDown(projectList, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('displays "No projects found" message when search has no matches', () => {
    const testProjects = Array.from({ length: 11 }, (_, i) => ({
      id: `project-${i + 1}`,
      title: `Project ${i + 1}`,
    }));
    projectsState.value = {
      ...projectsState.value,
      projects: testProjects,
      callState: RequestStatus.LOADED,
    };

    renderSwitchProjectMenu(<SwitchProjectMenu />);

    const searchInput = screen.getByPlaceholderText('Search project...');
    fireEvent.change(searchInput, { target: { value: 'Non-matching project name' } });

    expect(screen.getByText('No projects found')).toBeInTheDocument();
    expect(screen.queryByText('Project 1')).not.toBeInTheDocument();
  });
});

function renderSwitchProjectMenu(children: ReactNode) {
  render(<MemoryRouter>{children}</MemoryRouter>);
}
