import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberWithScopeDto } from '../../features/contexts/types/context.types';
import { MembersTab } from './MembersTab';

const members = [
  { userId: 'u1', email: 'ada@example.com', displayName: 'Ada' },
  { userId: 'u2', email: 'ben@example.com', displayName: 'Ben' },
] as MemberWithScopeDto[];

const mocks = vi.hoisted(() => ({ toastError: vi.fn(), isAdmin: true }));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() });
  return { default: toast, toast };
});

vi.mock('../../features/project-settings/members/model/members-settings.context', () => ({
  useMembersSettings: () => ({
    members,
    hasLoaded: true,
    contexts: [],
    refresh: vi.fn(),
    optimisticRemoveMember: vi.fn(),
    isAdmin: mocks.isAdmin,
    openInviteSheet: vi.fn(),
    hasLoadError: false,
  }),
}));
vi.mock('../../features/project-settings/members/components/MembersTable/MembersTable', () => ({
  MembersTable: ({ onRowClick }: { onRowClick: (member: MemberWithScopeDto) => void }) => (
    <button
      onClick={() => {
        onRowClick(members[0]);
      }}
    >
      Row Ada
    </button>
  ),
}));
vi.mock(
  '../../features/project-settings/members/components/PendingRequestsSection/PendingRequestsSection',
  () => ({ PendingRequestsSection: () => null })
);
vi.mock(
  '../../features/project-settings/members/components/UserProvisioningSettings/UserProvisioningSettings',
  () => ({ UserProvisioningSettings: () => null })
);
vi.mock(
  '../../features/project-settings/members/components/MemberDetailsSheet/MemberDetailsSheet',
  () => ({
    MemberDetailsSheet: ({
      isOpen,
      member,
      link,
      onClose,
    }: {
      isOpen: boolean;
      member: MemberWithScopeDto | null;
      link?: string | null;
      onClose: () => void;
    }) =>
      isOpen ? (
        <div data-testid='memberSheet'>
          {member?.displayName}
          <span data-testid='memberLink'>{link}</span>
          <button onClick={onClose}>Close sheet</button>
        </div>
      ) : null,
  })
);

function Search() {
  return <div data-testid='search'>{useLocation().search}</div>;
}

function renderTab(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/members',
        element: (
          <>
            <MembersTab />
            <Search />
          </>
        ),
      },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
}

describe('MembersTab', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
    mocks.isAdmin = true;
  });

  it('opens the linked member, keeps the parameter while open and drops it on close', async () => {
    renderTab('/members?member=u2');

    expect(await screen.findByTestId('memberSheet')).toHaveTextContent('Ben');
    expect(screen.getByTestId('search').textContent).toBe('?member=u2');
    expect(screen.getByTestId('memberLink').textContent).toContain('/members?member=u2');

    fireEvent.click(screen.getByText('Close sheet'));
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
    expect(screen.queryByTestId('memberSheet')).toBeNull();
  });

  it('writes the member to the URL when a row opens the sheet', async () => {
    renderTab('/members');

    fireEvent.click(screen.getByText('Row Ada'));

    expect(await screen.findByTestId('memberSheet')).toHaveTextContent('Ada');
    expect(screen.getByTestId('search').textContent).toBe('?member=u1');
  });

  it('shows a toast and drops the parameter for an unknown member', async () => {
    renderTab('/members?member=gone');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('This member is not in the project.', {
        id: 'member-not-found',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
    expect(screen.queryByTestId('memberSheet')).toBeNull();
  });

  it('does nothing for a link when the user is not an admin', () => {
    mocks.isAdmin = false;
    renderTab('/members?member=u2');

    expect(screen.queryByTestId('memberSheet')).toBeNull();
    expect(screen.getByTestId('search').textContent).toBe('?member=u2');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
