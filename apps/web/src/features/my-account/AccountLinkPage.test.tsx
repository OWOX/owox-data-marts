import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountLinkPage } from './AccountLinkPage';
import { appFlagsService } from '../../app/services/app-flags.service';
import { downloadBlob } from '../data-marts/model-canvas/export/download';

vi.mock('../data-marts/model-canvas/export/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('../../app/services/app-flags.service', () => ({
  appFlagsService: { getPublicFlags: vi.fn() },
}));

const topics = {
  topics: [{ id: 'Offers', subscribed: false, signature: 'fresh-topic-proof' }],
  allSignature: 'all-proof',
};
function renderLink(
  action: 'subscriptions' | 'export' = 'subscriptions',
  search = '?email=anna%2Btest%40example.test&hash=old-proof&topicName=Offers&expires_date=2030-01-02'
) {
  render(
    <StrictMode>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <MemoryRouter initialEntries={[`/${action}${search}`]}>
          <AccountLinkPage action={action} />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Public account links', () => {
  function cloud() {
    vi.mocked(appFlagsService.getPublicFlags).mockResolvedValue({
      IDP_PROVIDER: 'owox-better-auth',
      CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
    });
  }

  it('automatically unsubscribes once without an auth or project provider, even in Strict Mode', async () => {
    cloud();
    const fetch = vi.fn().mockResolvedValue(Response.json(topics));
    vi.stubGlobal('fetch', fetch);
    renderLink();
    expect(await screen.findByRole('switch', { name: 'Offers' })).not.toBeChecked();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://ib.example.test/api/account/email-preferences/link'),
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
          email: 'anna+test@example.test',
          signature: 'old-proof',
          topicId: 'Offers',
          expiresAt: '2030-01-02',
          subscribed: false,
        }),
      })
    );
  });

  it('uses the returned per-topic proof and original expiry for the next toggle', async () => {
    cloud();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(topics))
      .mockResolvedValueOnce(
        Response.json({ ...topics, topics: [{ ...topics.topics[0], subscribed: true }] })
      );
    vi.stubGlobal('fetch', fetch);
    renderLink();
    fireEvent.click(await screen.findByRole('switch', { name: 'Offers' }));
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Offers' })).toBeChecked();
    });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          email: 'anna+test@example.test',
          signature: 'fresh-topic-proof',
          topicId: 'Offers',
          expiresAt: '2030-01-02',
          subscribed: true,
        }),
      })
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not silently retry an invalid signature or display its response body', async () => {
    cloud();
    const fetch = vi.fn().mockResolvedValue(new Response('secret-response', { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    renderLink();
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
    expect(screen.queryByText('secret-response')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not call an API for a missing or invalid email link', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderLink('subscriptions', '?email=bad&hash=proof');
    expect(screen.getByRole('alert')).toHaveTextContent('full link');
    expect(appFlagsService.getPublicFlags).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['better-auth', 'none'])('does not enable Cloud actions for %s', async provider => {
    vi.mocked(appFlagsService.getPublicFlags).mockResolvedValue({
      IDP_PROVIDER: provider,
      CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderLink();
    expect(await screen.findByRole('alert')).toHaveTextContent('only in OWOX Cloud');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires an explicit click to download personal data from a signed link', async () => {
    cloud();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        account: 'anna@example.test',
        name: 'Anna',
        email: '',
        phone: null,
        companyName: null,
        companyWebsite: null,
        policyInteraction: null,
      })
    );
    vi.stubGlobal('fetch', fetch);
    renderLink('export');
    const button = await screen.findByRole('button', { name: 'Download personal data' });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'user_info.json');
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
