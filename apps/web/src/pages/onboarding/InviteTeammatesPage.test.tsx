import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteTeammatesPage } from './InviteTeammatesPage';
import { useIsAdmin } from '../../features/idp';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import { trackEvent } from '../../utils/data-layer';

vi.mock('../../features/idp', () => ({ useIsAdmin: vi.fn() }));
vi.mock('../../features/project-members/services/project-members.service', () => ({
  projectMembersService: { inviteMember: vi.fn() },
}));
vi.mock('../../utils/data-layer', () => ({ trackEvent: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const inviteMember = vi.mocked(projectMembersService.inviteMember);

function CurrentLocation() {
  const location = useLocation();
  return <div data-testid='location'>{location.pathname + location.search}</div>;
}

function renderPage(search = '?redirect=%2Fui%2Fproject-1%2Fdata-marts') {
  return render(
    <MemoryRouter initialEntries={[`/ui/project-1/onboarding/invite-teammates${search}`]}>
      <Routes>
        <Route
          path='/ui/:projectId/onboarding/invite-teammates'
          element={<InviteTeammatesPage />}
        />
        <Route path='*' element={<CurrentLocation />} />
      </Routes>
    </MemoryRouter>
  );
}

function emailInput() {
  return screen.getByLabelText('Teammate email');
}

function addEmail(email: string) {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.keyDown(emailInput(), { key: 'Enter' });
}

function trackedEvents() {
  return vi.mocked(trackEvent).mock.calls.map(([event]) => event.event);
}

describe('InviteTeammatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsAdmin).mockReturnValue(true);
    inviteMember.mockResolvedValue({ kind: 'email-sent', email: 'x', role: 'editor' });
  });

  it('invites every added email as a project-wide Data Owner and continues', async () => {
    renderPage();
    expect(trackedEvents()).toEqual(['onboarding_invite_shown']);

    addEmail('Ann@Company.com');
    addEmail('bob@company.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 invites' }));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/ui/project-1/data-marts');
    });
    expect(inviteMember.mock.calls.map(([payload]) => payload)).toEqual([
      { email: 'ann@company.com', role: 'editor', roleScope: 'entire_project' },
      { email: 'bob@company.com', role: 'editor', roleScope: 'entire_project' },
    ]);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'onboarding_invite_sent', label: 'editor', value: '2' })
    );
  });

  it('sends the address still in the input without pressing Enter', async () => {
    renderPage();
    fireEvent.change(emailInput(), { target: { value: 'ann@company.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(inviteMember).toHaveBeenCalledTimes(1);
    });
    expect(inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ann@company.com' })
    );
  });

  it('splits a pasted list into separate addresses', () => {
    renderPage();
    fireEvent.paste(emailInput(), {
      clipboardData: { getData: () => 'ann@company.com, bob@company.com; ann@company.com' },
    });

    expect(screen.getByRole('button', { name: 'Remove ann@company.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove bob@company.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send 2 invites' })).toBeTruthy();
  });

  it('keeps an invalid address in the input with an error', () => {
    renderPage();
    addEmail('not-an-email');

    expect(screen.getByRole('alert').textContent).toContain('"not-an-email"');
    expect((emailInput() as HTMLInputElement).value).toBe('not-an-email');
  });

  it('keeps only the failed addresses for a retry', async () => {
    inviteMember
      .mockResolvedValueOnce({ kind: 'email-sent', email: 'ann@company.com', role: 'editor' })
      .mockRejectedValueOnce(new Error('Already a member'));
    renderPage();
    addEmail('ann@company.com');
    addEmail('bob@company.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 invites' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        "Couldn't invite bob@company.com: Already a member"
      );
    });
    expect(screen.queryByRole('button', { name: 'Remove ann@company.com' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove bob@company.com' })).toBeTruthy();
    expect(screen.queryByTestId('location')).toBeNull();
  });

  it('skips to the redirect target', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(screen.getByTestId('location').textContent).toBe('/ui/project-1/data-marts');
    expect(trackedEvents()).toEqual(['onboarding_invite_shown', 'onboarding_invite_skipped']);
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it('sends non-admins straight on without tracking', () => {
    vi.mocked(useIsAdmin).mockReturnValue(false);
    renderPage();

    expect(screen.getByTestId('location').textContent).toBe('/ui/project-1/data-marts');
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('ignores redirect targets outside the app', () => {
    renderPage('?redirect=https%3A%2F%2Fevil.example');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});
