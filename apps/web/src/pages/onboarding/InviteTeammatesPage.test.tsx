import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteTeammatesPage } from './InviteTeammatesPage';
import { useFlags } from '../../app/store/hooks';
import { useIsAdmin } from '../../features/idp';
import { RedirectStorageService } from '../../features/idp/services/redirect-storage.service';
import { projectMembersService } from '../../features/project-members/services/project-members.service';
import { trackEvent } from '../../utils/data-layer';

vi.mock('../../features/idp', () => ({ useIsAdmin: vi.fn() }));
vi.mock('../../app/store/hooks', () => ({ useFlags: vi.fn() }));
vi.mock('../../features/project-members/services/project-members.service', () => ({
  projectMembersService: { inviteMember: vi.fn() },
}));
vi.mock('../../utils/data-layer', () => ({ trackEvent: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const inviteMember = vi.mocked(projectMembersService.inviteMember);

function mockIdp(provider: string) {
  vi.mocked(useFlags).mockReturnValue({
    flags: { IDP_PROVIDER: provider },
  } as unknown as ReturnType<typeof useFlags>);
}

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
    mockIdp('owox-better-auth');
    inviteMember.mockResolvedValue({ kind: 'email-sent', email: 'x', role: 'editor' });
  });

  afterEach(() => {
    sessionStorage.clear();
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
    // Silent: the page lists failures itself, so the API client must not toast them too.
    expect(inviteMember.mock.calls).toEqual([
      [{ email: 'ann@company.com', role: 'editor', roleScope: 'entire_project' }, { silent: true }],
      [{ email: 'bob@company.com', role: 'editor', roleScope: 'entire_project' }, { silent: true }],
    ]);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'onboarding_invite_sent', label: 'editor', value: '2' })
    );
  });

  it('counts and sends the address still in the input without pressing Enter', async () => {
    renderPage();
    addEmail('ann@company.com');
    fireEvent.change(emailInput(), { target: { value: 'bob@company.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 invites' }));

    await waitFor(() => {
      expect(inviteMember).toHaveBeenCalledTimes(2);
    });
    expect(inviteMember).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: 'bob@company.com' }),
      { silent: true }
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

  it('keeps a pasted list that is too long in the input', () => {
    renderPage();
    const tooMany = Array.from({ length: 21 }, (_, i) => `user${String(i)}@company.com`).join(' ');
    fireEvent.paste(emailInput(), { clipboardData: { getData: () => tooMany } });

    expect(screen.getByRole('alert').textContent).toContain('up to 20 people');
    expect((emailInput() as HTMLInputElement).value).toBe(tooMany);
  });

  it('keeps an invalid address in the input with an error', () => {
    renderPage();
    addEmail('ann@company.com');
    addEmail('not-an-email');

    // The typo isn't counted as an invite.
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeTruthy();

    expect(screen.getByRole('alert').textContent).toContain('"not-an-email"');
    expect((emailInput() as HTMLInputElement).value).toBe('not-an-email');
    expect(emailInput().getAttribute('aria-describedby')).toBe(
      screen.getByRole('alert').getAttribute('id')
    );
  });

  it('keeps only the failed addresses, each with its reason, for a retry', async () => {
    inviteMember
      .mockResolvedValueOnce({ kind: 'email-sent', email: 'ann@company.com', role: 'editor' })
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Already a member' } } })
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Email is blocked' } } });
    renderPage();
    addEmail('ann@company.com');
    addEmail('bob@company.com');
    addEmail('carl@company.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send 3 invites' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => {
      expect(alert.textContent).toContain('Sent 1 invitation.');
    });
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'bob@company.com: Already a member',
      'carl@company.com: Email is blocked',
    ]);
    expect(screen.queryByRole('button', { name: 'Remove ann@company.com' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send 2 invites' })).toBeTruthy();
    expect(screen.queryByTestId('location')).toBeNull();
  });

  it('names the request id of a server error the response did not explain', async () => {
    inviteMember.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { requestId: 'r-1' } },
      })
    );
    renderPage();
    addEmail('ann@company.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByRole('listitem')).toHaveProperty(
      'textContent',
      'ann@company.com: Something went wrong on our side. Request id: r-1'
    );
  });

  it('clears the keys GTM would carry over from an earlier push', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    for (const event of ['onboarding_invite_shown', 'onboarding_invite_skipped']) {
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event, label: null, value: null, context: null })
      );
    }
  });

  it('skips to the redirect target', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(screen.getByTestId('location').textContent).toBe('/ui/project-1/data-marts');
    expect(trackedEvents()).toEqual(['onboarding_invite_shown', 'onboarding_invite_skipped']);
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it('continues to the deep link opened before sign-up and consumes it', () => {
    RedirectStorageService.save('/ui/none/plugins/gallery?plugin=p1');
    renderPage('?redirect=%2F');

    expect(screen.getByLabelText('Teammate email')).toBeTruthy();
    expect(RedirectStorageService.retrieve()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByTestId('location').textContent).toBe(
      '/ui/project-1/plugins/gallery?plugin=p1'
    );
  });

  it('sends non-admins straight on without tracking', () => {
    vi.mocked(useIsAdmin).mockReturnValue(false);
    renderPage();

    expect(screen.getByTestId('location').textContent).toBe('/ui/project-1/data-marts');
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('is skipped under an IDP that may answer with a link to share instead of an email', () => {
    mockIdp('better-auth');
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
