import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestStatus } from '../../shared/types/request-status';
import { UserMenu } from '../../components/AppSidebar/UserMenu';
import { MyAccountPage } from './MyAccountPage';

const useFlags = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ viewOnly: false }));

vi.mock('../../app/store/hooks', () => ({ useFlags }));
vi.mock('../idp/hooks/useProjects', () => ({
  useProjects: () => ({
    callState: RequestStatus.LOADED,
    loadProjects: vi.fn(),
    projects: [
      { id: 'project-2', title: 'Marketing', roles: ['viewer'], status: 'active' },
      { id: 'project-3', title: 'Sales analytics', roles: ['editor', 'admin'], status: 'blocked' },
    ],
  }),
}));
vi.mock('../idp/hooks', () => ({
  useAuth: () => ({
    user: { fullName: 'Anna', email: 'anna@example.test', roles: [] },
    signOut: vi.fn(),
  }),
}));
vi.mock('../idp/hooks/useAuthState', () => ({
  useAuthState: () => ({
    isAuthenticated: true,
    session: { accessToken: 'interactive-app-token' },
    user: { id: 'account-1', projectId: 'project-1', roles: [], viewOnly: auth.viewOnly },
  }),
}));

function renderProfile(initialPath = '/ui/me/profile') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path='/ui/me/profile' element={<MyAccountPage />} />
          <Route path='/ui/me/projects' element={<MyAccountPage section='projects' />} />
          <Route
            path='/ui/me/email-preferences'
            element={<MyAccountPage section='email-preferences' />}
          />
          <Route path='/ui/project-1/request-access' element={<UserMenu />} />
          <Route path='/' element={<h1>Home</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('My profile', () => {
  const profile = {
    fullName: 'Anna Kowalska',
    email: 'anna@example.test',
    workEmail: 'anna@company.test',
    phone: '',
    companyName: 'Example Company',
    companyWebsite: '',
    erasureRequest: null,
  };

  function enableCloud() {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: {
        IDP_PROVIDER: 'owox-better-auth',
        CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
      },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    useFlags.mockReset();
    auth.viewOnly = false;
  });

  it('reads and displays the personal profile with the current IB token and empty project roles', async () => {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: {
        IDP_PROVIDER: 'owox-better-auth',
        CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
      },
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          fullName: 'Anna Kowalska',
          email: 'anna@example.test',
          workEmail: 'anna@company.test',
          phone: '',
          companyName: 'Example Company',
          companyWebsite: '',
        })
      )
    );
    vi.stubGlobal('fetch', fetch);

    renderProfile('/ui/project-1/request-access');
    fireEvent.keyDown(screen.getByRole('button', { name: /Anna/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'My profile' }));

    expect(await screen.findByText('Anna Kowalska')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Request access' })).toHaveAttribute(
      'href',
      '/ui/project-1/request-access'
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://ib.example.test/api/account/me'),
      expect.objectContaining({
        headers: { 'X-OWOX-Authorization': 'Bearer interactive-app-token' },
        credentials: 'omit',
        redirect: 'error',
      })
    );
  });

  it.each(['better-auth', 'none'])('does not call the Cloud API under %s', async provider => {
    useFlags.mockReturnValue({
      callState: RequestStatus.LOADED,
      flags: { IDP_PROVIDER: provider, CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test' },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows roles from each project rather than the empty roles of the current project', async () => {
    enableCloud();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(profile)));

    renderProfile();
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    const table = within(await screen.findByRole('table', { name: 'My projects' }));
    expect(table.getByRole('row', { name: /Marketing Active Business User/ })).toBeVisible();
    expect(
      table.getByRole('row', { name: /Sales analytics Blocked Data Owner, Project Admin/ })
    ).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText('Search projects'), {
      target: { value: 'Sales' },
    });
    expect(table.queryByText('Marketing')).not.toBeInTheDocument();
    expect(table.getByText('Sales analytics')).toBeVisible();
  });

  it('saves a personal email preference without project roles', async () => {
    enableCloud();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ topics: [{ id: 'Offers', subscribed: true }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ topics: [{ id: 'Offers', subscribed: false }] }));
    vi.stubGlobal('fetch', fetch);
    renderProfile('/ui/me/email-preferences');

    const offers = await screen.findByRole('switch', { name: 'Offers' });
    expect(offers).toBeChecked();
    fireEvent.click(offers);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Offers' })).not.toBeChecked();
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL('https://ib.example.test/api/account/me/email-preferences/Offers'),
      expect.objectContaining({ method: 'PATCH', body: '{"subscribed":false}' })
    );
  });

  it('shows email preferences as read-only while viewing another account', async () => {
    enableCloud();
    auth.viewOnly = true;
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ topics: [{ id: 'Offers', subscribed: false }] }));
    vi.stubGlobal('fetch', fetch);
    renderProfile('/ui/me/email-preferences');

    const offers = await screen.findByRole('switch', { name: 'Offers' });
    expect(offers).toBeDisabled();
    fireEvent.click(offers);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('lets an empty-role session edit its own profile without changing the sign-in email', async () => {
    enableCloud();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json({ ...profile, fullName: 'Anna Nowak' }));
    vi.stubGlobal('fetch', fetch);

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('Sign-in email')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Anna Nowak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Anna Nowak')).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith(
      new URL('https://ib.example.test/api/account/me'),
      expect.objectContaining({ method: 'PATCH', body: '{"fullName":"Anna Nowak"}' })
    );
  });

  it('submits and cancels the pending erasure request using the displayed request ID', async () => {
    enableCloud();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          ...profile,
          erasureRequest: { id: 'request-1', status: 'pending' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal('fetch', fetch);

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Request account deletion' }));
    fireEvent.click(screen.getByRole('button', { name: /^Request deletion$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel deletion request' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request account deletion' })).toBeVisible();
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://ib.example.test/api/account/me/erasure-request'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://ib.example.test/api/account/me/erasure-request/request-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it.each([null, { id: 'request-1', status: 'pending' }])(
    'hides all account mutations in view-only mode',
    async erasureRequest => {
      enableCloud();
      auth.viewOnly = true;
      const fetch = vi.fn().mockResolvedValue(Response.json({ ...profile, erasureRequest }));
      vi.stubGlobal('fetch', fetch);

      renderProfile();

      expect(await screen.findByText('Anna Kowalska')).toBeVisible();
      expect(screen.getByText(/viewing this account in read-only mode/)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Request account deletion' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Cancel deletion request' })
      ).not.toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );
});
