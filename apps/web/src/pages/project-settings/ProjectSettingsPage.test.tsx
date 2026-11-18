import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembershipRequestDto } from '../../features/project-members/types';
import { useMembersSettings } from '../../features/project-settings/members/model/members-settings.context';
import { ProjectSettingsPage } from './ProjectSettingsPage';

const requests = [{ requestId: 'r1', email: 'ada@example.com' }] as MembershipRequestDto[];

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  getMembershipRequests: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() }),
}));
vi.mock('../../app/store/hooks', () => ({ useFlags: () => ({ flags: {} }) }));
vi.mock('../../features/idp/hooks/useRole', () => ({ useIsAdmin: () => true }));
vi.mock('../../components/AppSidebar/SetupChecklist/useSetupProgress', () => ({
  useRefreshSetupProgress: () => vi.fn(),
}));
vi.mock('../../features/contexts/services/context.service', () => ({
  contextService: { getContexts: () => Promise.resolve([]) },
}));
vi.mock('../../features/project-members/services/project-members.service', () => ({
  projectMembersService: {
    getMembers: () => Promise.resolve([]),
    getMembershipRequests: mocks.getMembershipRequests,
  },
}));
vi.mock(
  '../../features/project-settings/members/components/InviteMemberSheet/InviteMemberSheet',
  () => ({ InviteMemberSheet: () => null })
);
vi.mock('../../features/contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));
vi.mock(
  '../../features/project-settings/members/components/MembershipRequestSheet/MembershipRequestSheet',
  () => ({
    MembershipRequestSheet: ({
      request,
      link,
      onClose,
      onResolved,
    }: {
      request: MembershipRequestDto | null;
      link?: string | null;
      onClose: () => void;
      onResolved: (mutated: boolean) => void;
    }) => {
      const { optimisticRemoveRequest } = useMembersSettings();
      return request ? (
        <div data-testid='requestSheet'>
          {request.email}
          <span data-testid='requestLink'>{link}</span>
          <button onClick={onClose}>Close sheet</button>
          <button
            onClick={() => {
              // The real sheet drops the request from the list before it reports.
              optimisticRemoveRequest(request.requestId);
              onResolved(true);
            }}
          >
            Approve
          </button>
        </div>
      ) : null;
    },
  })
);

function Row() {
  const { openMembershipRequestSheet, refresh } = useMembersSettings();
  return (
    <>
      <button
        onClick={() => {
          openMembershipRequestSheet(requests[0]);
        }}
      >
        Open request
      </button>
      <button
        onClick={() => {
          void refresh();
        }}
      >
        Refresh
      </button>
    </>
  );
}

function renderPage(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/settings',
        element: <ProjectSettingsPage />,
        children: [{ index: true, element: <Row /> }],
      },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ProjectSettingsPage membership request sheet', () => {
  beforeEach(() => {
    mocks.toastError.mockClear();
    mocks.getMembershipRequests.mockReset();
    mocks.getMembershipRequests.mockResolvedValue(requests);
  });

  it('opens the linked request once the list loads and keeps the parameter', async () => {
    const router = renderPage('/settings?request=r1');

    expect(await screen.findByTestId('requestSheet')).toHaveTextContent('ada@example.com');
    expect(router.state.location.search).toBe('?request=r1');
    expect(screen.getByTestId('requestLink').textContent).toContain('/settings?request=r1');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('writes the request to the URL on open and removes it on close', async () => {
    const router = renderPage('/settings');

    fireEvent.click(await screen.findByText('Open request'));
    expect(await screen.findByTestId('requestSheet')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?request=r1');

    fireEvent.click(screen.getByText('Close sheet'));
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });

  it('shows a toast and drops the parameter for an unknown request', async () => {
    const router = renderPage('/settings?request=gone');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This membership request was already handled or is not available.',
        { id: 'request-not-found' }
      );
    });
    expect(router.state.location.search).toBe('');
  });

  it('closes the sheet before the reload, with no toast for the handled request', async () => {
    const router = renderPage('/settings?request=r1');
    await screen.findByTestId('requestSheet');

    // The reload no longer has the handled request.
    mocks.getMembershipRequests.mockResolvedValue([]);
    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
    await waitFor(() => {
      expect(mocks.getMembershipRequests).toHaveBeenCalledTimes(2);
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('keeps a link without a toast when the requests fetch fails, and opens it after a refresh', async () => {
    mocks.getMembershipRequests.mockRejectedValueOnce(new Error('down'));
    const router = renderPage('/settings?request=r1');

    await waitFor(() => {
      expect(mocks.getMembershipRequests).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(await screen.findByText('Refresh'));

    expect(await screen.findByTestId('requestSheet')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?request=r1');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('keeps the open sheet when a refresh of the requests fails', async () => {
    renderPage('/settings?request=r1');
    await screen.findByTestId('requestSheet');

    mocks.getMembershipRequests.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mocks.getMembershipRequests).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByTestId('requestSheet')).toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('keeps the sheet open while a refresh runs', async () => {
    renderPage('/settings?request=r1');
    await screen.findByTestId('requestSheet');

    // Hold the reload open, so the page stays in its loading state.
    mocks.getMembershipRequests.mockReturnValue(new Promise(() => undefined));
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mocks.getMembershipRequests).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByTestId('requestSheet')).toBeInTheDocument();
  });
});
