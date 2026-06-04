import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import { ProjectMenuContent } from './ProjectMenuContent';

const projectsState = vi.hoisted(() => ({
  value: {
    projects: [] as { id: string; title: string }[],
    callState: 'idle' as RequestStatus,
    error: null,
    isLoading: false,
    loadProjects: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('../../../features/idp/hooks/useProjects.ts', () => ({
  useProjects: () => projectsState.value,
}));

vi.mock('./SwitchProjectMenu', () => ({
  SwitchProjectMenu: ({ showSeparator }: { showSeparator?: boolean }) => (
    <div data-show-separator={String(Boolean(showSeparator))}>Switch project</div>
  ),
}));

vi.mock('@owox/ui/components/dropdown-menu', () => ({
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode; disabled?: boolean }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

describe('ProjectMenuContent', () => {
  beforeEach(() => {
    projectsState.value = {
      projects: [],
      callState: RequestStatus.IDLE,
      error: null,
      isLoading: false,
      loadProjects: vi.fn(),
      reset: vi.fn(),
    };
  });

  it('loads projects and keeps switch-project available while restricted menu is idle', async () => {
    render(<ProjectMenuContent restricted onClose={vi.fn()} />);

    expect(screen.getByText('Switch project')).toBeInTheDocument();
    expect(screen.queryByText('No other projects available')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(projectsState.value.loadProjects).toHaveBeenCalledTimes(1);
    });
  });

  it('shows switch-project in restricted menu when at least one accessible project exists', () => {
    projectsState.value = {
      ...projectsState.value,
      projects: [{ id: 'project-2', title: 'Project 2' }],
      callState: RequestStatus.LOADED,
    };

    render(<ProjectMenuContent restricted onClose={vi.fn()} />);

    expect(screen.getByText('Switch project')).toBeInTheDocument();
    expect(screen.queryByText('No other projects available')).not.toBeInTheDocument();
  });
});
