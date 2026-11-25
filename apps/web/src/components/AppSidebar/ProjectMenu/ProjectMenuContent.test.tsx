import type { ReactNode } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../../../features/idp/types';
import { ProjectMenuContent } from './ProjectMenuContent';
import { useProjectMenu } from './useProjectMenu';

let projects: Project[] = [];

vi.mock('../../../app/store/hooks', () => ({
  useFlags: () => ({ flags: { IDP_PROVIDER: 'owox-better-auth' } }),
  useProject: () => ({ id: 'current-project' }),
}));
vi.mock('../../../features/idp/hooks/useProjects', () => ({
  useProjects: () => ({ projects, loadProjects: vi.fn() }),
}));

vi.mock('./SwitchProjectMenu', () => ({
  SwitchProjectMenu: ({
    autoLoad,
    emptyMessage,
    excludeCurrentProject,
    showSeparator,
  }: {
    autoLoad?: boolean;
    emptyMessage?: string;
    excludeCurrentProject?: boolean;
    showSeparator?: boolean;
  }) => (
    <div
      data-auto-load={String(Boolean(autoLoad))}
      data-empty-message={emptyMessage}
      data-exclude-current-project={String(Boolean(excludeCurrentProject))}
      data-show-separator={String(Boolean(showSeparator))}
    >
      Switch project
    </div>
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
  it('uses restricted switch-project menu without requiring onClose', () => {
    render(<ProjectMenuContent restricted createProjectItem={<button>Create project</button>} />);

    const switchProjectMenu = screen.getByText('Switch project');
    expect(switchProjectMenu).toBeInTheDocument();
    expect(switchProjectMenu).toHaveAttribute('data-auto-load', 'true');
    expect(switchProjectMenu).toHaveAttribute('data-empty-message', 'No other projects available');
    expect(switchProjectMenu).toHaveAttribute('data-exclude-current-project', 'true');
    expect(switchProjectMenu).toHaveAttribute('data-show-separator', 'false');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });

  it('offers switching when the only remaining project differs from the current session', () => {
    projects = [{ id: 'remaining-project', title: 'Remaining', status: 'active' }];
    const { result, rerender } = renderHook(() => useProjectMenu());
    expect(result.current.canSwitchProject).toBe(true);

    projects = [{ id: 'current-project', title: 'Current', status: 'active' }];
    rerender();
    expect(result.current.canSwitchProject).toBe(false);
  });
});
