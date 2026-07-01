import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MembershipRequestRow } from '../MembershipRequestRow';
import type { MembershipRequestDto } from '../../../../../project-members/types';

const baseRequest: MembershipRequestDto = {
  requestId: 'req-1',
  email: 'alice@example.com',
  fullName: 'Alice Example',
  requestedRole: 'editor',
  createdAt: '2026-05-01T10:00:00Z',
};

describe('MembershipRequestRow', () => {
  it('renders full name as the primary line and email + role + date in the subtitle', () => {
    render(<MembershipRequestRow request={baseRequest} onClick={vi.fn()} />);
    expect(screen.getByText('Alice Example')).toBeInTheDocument();
    expect(screen.getByText(/alice@example\.com/i)).toBeInTheDocument();
    // `getRoleDisplayName('editor')` maps to 'Technical User' in this codebase
    // (see apps/web/src/features/idp/utils/role-display-name.ts).
    expect(screen.getByText(/Requested role: Technical User/i)).toBeInTheDocument();
    // formatDateShort uses the browser TZ. The fixture is '2026-05-01T10:00:00Z'
    // which renders with year 2026 in every IANA timezone. Anchoring on the
    // year only keeps the assertion TZ-independent.
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('falls back to email as the primary line when fullName is missing', () => {
    const noName: MembershipRequestDto = { ...baseRequest, fullName: undefined };
    render(<MembershipRequestRow request={noName} onClick={vi.fn()} />);
    // Email shows up twice (primary + subtitle). Use getAllByText.
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClick with the request when the row is clicked', () => {
    const onClick = vi.fn();
    render(<MembershipRequestRow request={baseRequest} onClick={onClick} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Open request from Alice Example/i }));
    });
    expect(onClick).toHaveBeenCalledWith(baseRequest);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes a stable testid that includes the requestId for E2E targeting', () => {
    render(<MembershipRequestRow request={baseRequest} onClick={vi.fn()} />);
    expect(screen.getByTestId('membershipRequestRow-req-1')).toBeInTheDocument();
  });
});
