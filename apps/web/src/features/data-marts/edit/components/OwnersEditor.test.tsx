// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectMember } from '../../../project-settings/notifications/types';
import type { UserProjectionDto } from '../../../../shared/types/api';
import { OwnersEditor } from './OwnersEditor';

interface MembersState {
  members: ProjectMember[];
  isLoading: boolean;
  error: string | null;
}

const mocks = vi.hoisted(() => ({
  members: { members: [], isLoading: false, error: null } as MembersState,
  refetch: vi.fn(),
}));

vi.mock('../../../project-settings/notifications/hooks/useNotificationSettings', () => ({
  useProjectMembers: () => ({ ...mocks.members, refetch: mocks.refetch }),
}));
vi.mock('../../../../app/store/hooks/useFlags', () => ({
  useFlags: () => ({ flags: null, callState: 'loaded' }),
}));

function member(userId: string, isOutbound = false): ProjectMember {
  return {
    userId,
    email: `${userId}@example.com`,
    displayName: userId,
    role: 'editor',
    hasNotificationsEnabled: false,
    isOutbound,
  };
}

function owner(userId: string): UserProjectionDto {
  return { userId, fullName: userId, email: `${userId}@example.com`, avatar: null };
}

/** Renders the editor and counts the yellow "no longer a member" icons next to the owners. */
function removedOwnerWarningCount(owners: UserProjectionDto[]): number {
  const { container } = render(
    <OwnersEditor ownerUsers={owners} onSave={vi.fn()} projectId='project-1' />
  );
  const count = container.querySelectorAll('svg.text-yellow-500').length;
  cleanup();
  return count;
}

afterEach(() => {
  cleanup();
  mocks.members = { members: [], isLoading: false, error: null };
  mocks.refetch.mockReset();
});

describe('OwnersEditor removed-owner warning', () => {
  it('does not flag owners while the member list is loading', () => {
    mocks.members = { members: [], isLoading: true, error: null };

    expect(removedOwnerWarningCount([owner('ann')])).toBe(0);
    expect(removedOwnerWarningCount([owner('ann'), owner('bob')])).toBe(0);
  });

  it('does not flag owners when the member list fails to load', () => {
    mocks.members = { members: [], isLoading: false, error: 'Failed to load project members' };

    expect(removedOwnerWarningCount([owner('ann')])).toBe(0);
    expect(removedOwnerWarningCount([owner('ann'), owner('bob')])).toBe(0);
  });

  it('treats an empty member list as a failed load: the viewer is always a member', async () => {
    // The server answers an identity provider failure with 200 and no members.
    mocks.members = { members: [], isLoading: false, error: null };

    expect(removedOwnerWarningCount([owner('ann')])).toBe(0);
    expect(removedOwnerWarningCount([owner('ann'), owner('bob')])).toBe(0);

    render(<OwnersEditor ownerUsers={[owner('ann')]} onSave={vi.fn()} projectId='project-1' />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit owners' }));
    expect(await screen.findByText("Couldn't load the project members.")).toBeInTheDocument();
    expect(document.querySelectorAll('svg.text-yellow-500')).toHaveLength(0);
  });

  it('does not flag owners who are project members', () => {
    mocks.members = { members: [member('ann'), member('bob')], isLoading: false, error: null };

    expect(removedOwnerWarningCount([owner('ann')])).toBe(0);
    expect(removedOwnerWarningCount([owner('ann'), owner('bob')])).toBe(0);
  });

  it('flags an owner who left the project once the member list has loaded', () => {
    mocks.members = { members: [member('ann', true)], isLoading: false, error: null };

    expect(removedOwnerWarningCount([owner('ann')])).toBe(1);
  });

  it('flags owners missing from the loaded member list', () => {
    mocks.members = { members: [member('ann')], isLoading: false, error: null };

    expect(removedOwnerWarningCount([owner('ann'), owner('gone')])).toBe(1);
  });

  it('says in the owner picker that the members could not load, instead of marking owners removed', async () => {
    mocks.members = { members: [], isLoading: false, error: 'Failed to load project members' };
    render(<OwnersEditor ownerUsers={[owner('ann')]} onSave={vi.fn()} projectId='project-1' />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit owners' }));

    expect(await screen.findByText("Couldn't load the project members.")).toBeInTheDocument();
    expect(document.querySelectorAll('svg.text-yellow-500')).toHaveLength(0);
    expect(screen.queryByText('This user is no longer a member of the project')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});
