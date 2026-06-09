import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectMenuContent } from './ProjectMenuContent';

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
    render(<ProjectMenuContent restricted />);

    const switchProjectMenu = screen.getByText('Switch project');
    expect(switchProjectMenu).toBeInTheDocument();
    expect(switchProjectMenu).toHaveAttribute('data-auto-load', 'true');
    expect(switchProjectMenu).toHaveAttribute('data-empty-message', 'No other projects available');
    expect(switchProjectMenu).toHaveAttribute('data-exclude-current-project', 'true');
    expect(switchProjectMenu).toHaveAttribute('data-show-separator', 'false');
  });
});
