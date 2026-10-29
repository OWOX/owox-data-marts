import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { MemberWithScopeDto } from '../../features/contexts/types/context.types';
import { MembersTab } from './MembersTab';

const members = [
  { userId: 'u1', email: 'ada@example.com', displayName: 'Ada' },
  { userId: 'u2', email: 'ben@example.com', displayName: 'Ben' },
] as MemberWithScopeDto[];

vi.mock('../../features/project-settings/members/model/members-settings.context', () => ({
  useMembersSettings: () => ({
    members,
    contexts: [],
    refresh: vi.fn(),
    optimisticRemoveMember: vi.fn(),
    isAdmin: true,
    openInviteSheet: vi.fn(),
    hasLoadError: false,
  }),
}));
vi.mock('../../features/project-settings/members/components/MembersTable/MembersTable', () => ({
  MembersTable: () => null,
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
    }: {
      isOpen: boolean;
      member: MemberWithScopeDto | null;
    }) => (isOpen ? <div data-testid='memberSheet'>{member?.displayName}</div> : null),
  })
);

function Search() {
  return <div data-testid='search'>{useLocation().search}</div>;
}

describe('MembersTab', () => {
  it('opens the linked member once and drops the parameter', async () => {
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
      { initialEntries: ['/members?member=u2'] }
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId('memberSheet')).toHaveTextContent('Ben');
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });
});
