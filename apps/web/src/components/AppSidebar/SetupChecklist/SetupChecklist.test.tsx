import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SetupChecklist } from './SetupChecklist';
import { SETUP_GROUPS } from './items';
import { GroupId, GroupStatusType, ProgressKey, type ProjectSetupProgress } from './types';
import type { SetupProgressResult } from './useSetupProgress';

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: vi.fn(), scope: (p: string) => `/ui/p1${p}` }),
}));

const notDone = { done: false, completedAt: null };
const progress = Object.fromEntries(
  Object.values(ProgressKey).map(key => [key, notDone])
) as ProjectSetupProgress;

function groupProgress(id: GroupId) {
  const group = SETUP_GROUPS.find(g => g.id === id);
  if (!group) throw new Error(`Unknown group ${id}`);
  return {
    group,
    status: GroupStatusType.NOT_STARTED,
    completedCount: 0,
    totalCount: group.stepIds.length,
    completedAt: null,
  };
}

function renderChecklist() {
  const progressResult: SetupProgressResult = {
    progress,
    completedStepIds: [],
    completedCount: 0,
    totalCount: 2,
    percentage: 50,
    isLoading: false,
    isAllComplete: false,
    groupProgresses: [groupProgress(GroupId.STORAGE), groupProgress(GroupId.INVITE_TEAMMATES)],
    refetch: vi.fn(),
  };
  render(
    <MemoryRouter>
      <SetupChecklist
        progressResult={progressResult}
        visibility={{ isVisible: true, show: vi.fn(), hide: vi.fn() }}
      />
    </MemoryRouter>
  );
}

describe('SetupChecklist', () => {
  it('opens project members straight from the Invite teammates item', () => {
    renderChecklist();

    const link = screen.getByRole('link', { name: 'Invite teammates' });
    expect(link.getAttribute('href')).toBe('/ui/p1/project-settings/members');
    expect(screen.queryByRole('button', { name: 'Invite teammates' })).toBeNull();
  });

  it('keeps the steps popover for groups without a direct link', () => {
    renderChecklist();

    expect(screen.getByRole('button', { name: 'Create first storage' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Create first storage' })).toBeNull();
  });
});
