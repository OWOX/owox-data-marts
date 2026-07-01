import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PendingRequestsSection } from '../PendingRequestsSection';
import {
  MembersSettingsReactContext,
  type MembersSettingsStoreValue,
} from '../../../model/members-settings.context';
import type { MembershipRequestDto } from '../../../../../project-members/types';

// Mock the row to keep this test focused on the section's orchestration
// (admin gate, counting, mapping). MembershipRequestRow has its own tests.
vi.mock('../MembershipRequestRow', () => ({
  MembershipRequestRow: ({
    request,
    onClick,
  }: {
    request: MembershipRequestDto;
    onClick: (r: MembershipRequestDto) => void;
  }) => (
    <button
      type='button'
      data-testid={`row-${request.requestId}`}
      onClick={() => {
        onClick(request);
      }}
    >
      {request.fullName ?? request.email}
    </button>
  ),
}));

const baseStore = (
  overrides: Partial<MembersSettingsStoreValue> = {}
): MembersSettingsStoreValue => ({
  contexts: [],
  members: [],
  pendingRequests: [],
  loading: false,
  loadingRequests: false,
  hasLoadError: false,
  refresh: vi.fn().mockResolvedValue(undefined),
  optimisticRemoveMember: vi.fn(),
  optimisticRemoveRequest: vi.fn(),
  isAdmin: true,
  openInviteSheet: vi.fn(),
  openAddContextSheet: vi.fn(),
  openMembershipRequestSheet: vi.fn(),
  ...overrides,
});

const request: MembershipRequestDto = {
  requestId: 'req-1',
  email: 'alice@example.com',
  fullName: 'Alice Example',
  requestedRole: 'viewer',
  createdAt: '2026-05-01T10:00:00Z',
};
const request2: MembershipRequestDto = {
  requestId: 'req-2',
  email: 'bob@example.com',
  fullName: 'Bob Example',
  requestedRole: 'editor',
  createdAt: '2026-05-02T10:00:00Z',
};

function renderSection(store: MembersSettingsStoreValue) {
  return render(
    <MembersSettingsReactContext.Provider value={store}>
      <PendingRequestsSection />
    </MembersSettingsReactContext.Provider>
  );
}

describe('PendingRequestsSection', () => {
  it('renders nothing when user is not admin', () => {
    const { container } = renderSection(baseStore({ isAdmin: false, pendingRequests: [request] }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when admin but no pending requests', () => {
    const { container } = renderSection(baseStore({ isAdmin: true, pendingRequests: [] }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the card header and one row per request', () => {
    renderSection(baseStore({ pendingRequests: [request, request2] }));
    expect(screen.getByTestId('pendingRequestsSection')).toBeInTheDocument();
    expect(screen.getByText(/Access requests/i)).toBeInTheDocument();
    expect(screen.getByTestId('row-req-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-req-2')).toBeInTheDocument();
  });

  it('opens the request sheet when a row is clicked', () => {
    const openMembershipRequestSheet = vi.fn();
    renderSection(baseStore({ pendingRequests: [request], openMembershipRequestSheet }));
    act(() => {
      fireEvent.click(screen.getByTestId('row-req-1'));
    });
    expect(openMembershipRequestSheet).toHaveBeenCalledWith(request);
  });
});
