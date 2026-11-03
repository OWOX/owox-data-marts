import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Credential,
  CredentialDefinition,
  CredentialSetup,
} from '../../features/credentials/types';
import { ConnectCredentialSetupPage } from './ConnectCredentialSetupPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  popup: vi.fn(),
  user: { id: 'user-1', projectId: 'project-1', roles: ['editor'] },
}));

vi.mock('../../app/api/apiClient', () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put },
}));
vi.mock('../../features/idp', () => ({
  useAuth: () => ({ user: mocks.user, status: 'authenticated' }),
}));
vi.mock('../../features/google-oauth/utils/open-google-oauth-popup', () => ({
  openGoogleOAuthPopup: mocks.popup,
  GoogleOAuthPopupClosedError: class extends Error {},
}));

const definition: CredentialDefinition = {
  id: 'github',
  source: 'builtin',
  displayName: 'GitHub',
  description: 'GitHub token',
  secretLabel: 'Personal access token',
  origins: ['https://api.github.com'],
  supportsAi: false,
  ai: null,
  compatibilityLine: null,
  auth: { type: 'header' },
};

const credential: Credential = {
  id: 'credential-1',
  projectId: 'project-1',
  title: 'Production account',
  definition,
  secretConfigured: true,
  definitionConsentRequired: false,
  enabled: true,
  availableForUse: false,
  availableForMaintenance: true,
  validationState: 'unknown',
  validationMessage: null,
  validatedAt: null,
  lastUsedAt: null,
  aiModelMappings: null,
  aiModelMappingModes: null,
  ownerUsers: [],
  contexts: [],
  usedBy: [],
  createdAt: '2026-11-02T10:00:00.000Z',
  modifiedAt: '2026-11-02T10:00:00.000Z',
};

function pendingSetup(overrides: Partial<CredentialSetup> = {}): CredentialSetup {
  return {
    id: 'setup-1',
    mode: 'create',
    status: 'pending',
    definitionId: definition.id,
    credentialId: null,
    title: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    completedAt: null,
    ...overrides,
  };
}

let setups: Map<string, CredentialSetup>;
let definitions: CredentialDefinition[];
let savedCredential: Credential;
let setupError: Error | null;
let credentialError: Error | null;
let definitionsError: Error | null;
let saveError: Error | null;
let completeError: Error | null;
let cancelError: Error | null;
let oauthAvailable: boolean;
let oauthSettingsError: Error | null;
let oauthSettingsRequest: (() => Promise<{ available: boolean }>) | undefined;
let completeRequest: (() => Promise<CredentialSetup>) | undefined;
let setupRequest: (() => Promise<CredentialSetup>) | undefined;
let credentialRequest: (() => Promise<Credential>) | undefined;
let exchangeRequest: (() => Promise<Credential>) | undefined;

function renderPage(path = '/ui/project-1/connect/credentials/setup-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/ui/:projectId/connect/credentials/:setupId',
        element: <ConnectCredentialSetupPage />,
      },
    ],
    { initialEntries: [path] }
  );
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...rendered, router, client };
}

async function saveNewCredential() {
  fireEvent.change(await screen.findByPlaceholderText('Enter Credential name'), {
    target: { value: 'My GitHub key' },
  });
  fireEvent.change(screen.getByLabelText('Personal access token'), {
    target: { value: 'private-provider-token' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.user = { id: 'user-1', projectId: 'project-1', roles: ['editor'] };
  setups = new Map([['setup-1', pendingSetup()]]);
  definitions = [definition];
  savedCredential = { ...credential };
  setupError = credentialError = definitionsError = saveError = completeError = cancelError = null;
  completeRequest = undefined;
  setupRequest = undefined;
  credentialRequest = undefined;
  exchangeRequest = undefined;
  oauthAvailable = true;
  oauthSettingsError = null;
  oauthSettingsRequest = undefined;
  mocks.popup.mockResolvedValue({ code: 'oauth-code', state: 'oauth-state' });

  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/credential-setup/')) {
      if (setupError) throw setupError;
      if (setupRequest) return { data: await setupRequest() };
      return { data: { ...setups.get(url.split('/')[2]) } };
    }
    if (url === '/credentials/definitions') {
      if (definitionsError) throw definitionsError;
      return { data: definitions };
    }
    if (url === '/credentials/oauth/google/settings') {
      if (oauthSettingsError) throw oauthSettingsError;
      if (oauthSettingsRequest) return { data: await oauthSettingsRequest() };
      return { data: { available: oauthAvailable } };
    }
    if (url === '/credentials/credential-1') {
      if (credentialError) throw credentialError;
      if (credentialRequest) return { data: await credentialRequest() };
      return { data: savedCredential };
    }
    if (url === '/contexts') return { data: [] };
    throw new Error(`Unexpected GET ${url}`);
  });

  mocks.post.mockImplementation(async (url: string, body?: { credentialId?: string }) => {
    if (url === '/credentials') {
      if (saveError) throw saveError;
      return { data: savedCredential };
    }
    if (url === '/credentials/oauth/google/authorize') {
      return { data: { authorizationUrl: 'https://accounts.google.com/oauth' } };
    }
    if (url === '/credentials/oauth/google/exchange') {
      return { data: exchangeRequest ? await exchangeRequest() : savedCredential };
    }
    const setup = setups.get(url.split('/')[2]);
    if (!setup) throw new Error(`Unexpected POST ${url}`);
    if (url.endsWith('/complete')) {
      if (completeRequest) return { data: await completeRequest() };
      if (completeError) throw completeError;
      const completed = {
        ...setup,
        status: 'completed' as const,
        credentialId: body?.credentialId ?? null,
        completedAt: new Date().toISOString(),
      };
      setups.set(setup.id, completed);
      return { data: completed };
    }
    if (url.endsWith('/cancel')) {
      if (cancelError) throw cancelError;
      const cancelled = { ...setup, status: 'cancelled' as const };
      setups.set(setup.id, cancelled);
      return { data: cancelled };
    }
    throw new Error(`Unexpected POST ${url}`);
  });
  mocks.put.mockImplementation(async () => {
    if (saveError) throw saveError;
    return { data: savedCredential };
  });
});

describe('ConnectCredentialSetupPage', () => {
  it.each([null, 'Marketing access'])(
    'saves a new Credential without a naming step (title: %s)',
    async title => {
      setups.set('setup-1', pendingSetup({ title }));
      renderPage();
      expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(title ?? 'GitHub');
      fireEvent.change(screen.getByLabelText('Personal access token'), {
        target: { value: 'private-provider-token' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByRole('heading', { name: 'Credential saved' });
      expect(mocks.post).toHaveBeenCalledWith(
        '/credentials',
        expect.objectContaining({
          title: title ?? 'GitHub',
        }),
        expect.anything()
      );
    }
  );

  it.each([null, 'Marketing account'])(
    'passes only an explicit name to Google OAuth (title: %s)',
    async title => {
      definitions = [{ ...definition, auth: { type: 'oauth', provider: 'google' } }];
      setups.set('setup-1', pendingSetup({ title }));
      renderPage();
      expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(title ?? '');
      await act(async () => {
        fireEvent.blur(screen.getByRole('textbox', { name: 'Name' }));
      });
      expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Connect with Google' }));
      await screen.findByRole('heading', { name: 'Credential saved' });
      const exchange = mocks.post.mock.calls.find(([url]) =>
        String(url).includes('/google/exchange')
      );
      expect(exchange).toBeDefined();
      if (title) expect(exchange![1]).toHaveProperty('title', title);
      else expect(exchange![1]).not.toHaveProperty('title');
    }
  );

  it('creates a private Credential with the server provider and completes the exact request', async () => {
    renderPage(
      '/ui/project-1/connect/credentials/setup-1?definitionId=evil&title=Injected&secret=bad'
    );

    expect(await screen.findByPlaceholderText('Enter Credential name')).toHaveValue('GitHub');
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue('GitHub');
    expect(screen.getByLabelText('Personal access token')).toHaveValue('');
    await saveNewCredential();

    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(screen.getByText(/return to your chat/i)).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith(
      '/credentials',
      expect.objectContaining({
        title: 'My GitHub key',
        definitionId: 'github',
        secret: { value: 'private-provider-token' },
        availableForUse: false,
        availableForMaintenance: false,
      }),
      expect.objectContaining({ skipErrorToast: true })
    );
    expect(mocks.post).toHaveBeenCalledWith(
      '/credential-setup/setup-1/complete',
      { credentialId: 'credential-1' },
      expect.anything()
    );
    expect(sessionStorage.length).toBe(0);
  });

  it('updates the requested Credential once before completing setup', async () => {
    setups.set('setup-1', pendingSetup({ mode: 'update', credentialId: 'credential-1' }));
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText('Enter Credential name'), {
      target: { value: 'Renamed key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
      '/credentials/credential-1',
      { title: 'Renamed key' },
      expect.objectContaining({ skipErrorToast: true })
    );
    expect(mocks.post.mock.calls.filter(([url]) => url === '/credentials')).toHaveLength(0);
  });

  it('reuses secret replacement and completes with the updated Credential', async () => {
    setups.set('setup-1', pendingSetup({ mode: 'update', credentialId: 'credential-1' }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Replace secret' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New secret'), {
      target: { value: 'replacement-token' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace secret' }));

    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
      '/credentials/credential-1',
      { secret: { value: 'replacement-token' } },
      expect.objectContaining({ skipErrorToast: true })
    );
  });

  it.each([undefined, 400, 409])(
    'shows a failed replacement inside the dialog and keeps the secret for retry (status %s)',
    async status => {
      setups.set('setup-1', pendingSetup({ mode: 'update', credentialId: 'credential-1' }));
      saveError = Object.assign(new Error('Provider rejected the key'), {
        response: status ? { status, data: { message: 'Provider rejected the key' } } : undefined,
      });
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: 'Replace secret' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('New secret'), {
        target: { value: 'replacement-token' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Replace secret' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Provider rejected the key'
      );
      expect(within(dialog).getByLabelText('New secret')).toHaveValue('replacement-token');
      expect(mocks.put).toHaveBeenCalledWith(
        '/credentials/credential-1',
        { secret: { value: 'replacement-token' } },
        expect.objectContaining({ skipErrorToast: true })
      );
      expect(mocks.post.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
      saveError = null;
      fireEvent.click(within(dialog).getByRole('button', { name: 'Replace secret' }));

      expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    }
  );

  it.each(['create', 'update'] as const)(
    'completes OAuth %s without a second Credential save',
    async mode => {
      const oauthDefinition: CredentialDefinition = {
        ...definition,
        id: 'google-sheets-oauth',
        displayName: 'Google Sheets',
        auth: { type: 'oauth', provider: 'google', client: 'destination' },
      };
      definitions = [oauthDefinition];
      savedCredential = { ...credential, definition: oauthDefinition };
      setups.set(
        'setup-1',
        pendingSetup({
          mode,
          definitionId: oauthDefinition.id,
          credentialId: mode === 'update' ? credential.id : null,
        })
      );
      renderPage();

      fireEvent.click(
        await screen.findByRole('button', {
          name: mode === 'create' ? 'Connect with Google' : /Authenticated as/,
        })
      );

      expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
      expect(
        mocks.post.mock.calls.filter(([url]) => url === '/credentials/oauth/google/exchange')
      ).toHaveLength(1);
      expect(mocks.post.mock.calls.filter(([url]) => url === '/credentials')).toHaveLength(0);
      expect(mocks.put).not.toHaveBeenCalled();
      expect(mocks.post).toHaveBeenCalledWith(
        '/credential-setup/setup-1/complete',
        { credentialId: 'credential-1' },
        expect.anything()
      );
      if (mode === 'create') {
        expect(mocks.post).toHaveBeenCalledWith(
          '/credentials/oauth/google/exchange',
          expect.objectContaining({ availableForUse: false, availableForMaintenance: false }),
          undefined
        );
      }
    }
  );

  it('keeps only the saved ID after completion failure and retries completion after refresh', async () => {
    completeError = new Error('Network unavailable');
    const first = renderPage();
    await saveNewCredential();

    expect(await screen.findByRole('button', { name: 'Retry completion' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Personal access token')).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem(sessionStorage.key(0) ?? '')).toBe('credential-1');
    first.unmount();
    completeError = null;
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry completion' }));
    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(mocks.post.mock.calls.filter(([url]) => url === '/credentials')).toHaveLength(1);
    expect(
      mocks.post.mock.calls.filter(([url]) => url === '/credential-setup/setup-1/complete')
    ).toHaveLength(2);
    expect(sessionStorage.length).toBe(0);
  });

  it.each(['expired', 'cancelled', 'completed'] as const)(
    'recovers the saved ID when setup becomes %s during the OAuth exchange',
    async status => {
      const oauthDefinition: CredentialDefinition = {
        ...definition,
        auth: { type: 'oauth', provider: 'google' },
      };
      definitions = [oauthDefinition];
      savedCredential = { ...credential, definition: oauthDefinition };
      let finishExchange!: (saved: Credential) => void;
      exchangeRequest = () =>
        new Promise(resolve => {
          finishExchange = resolve;
        });
      const page = renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Connect with Google' }));
      await waitFor(() => {
        expect(finishExchange).toBeDefined();
      });
      setups.set(
        'setup-1',
        pendingSetup({ status, credentialId: status === 'completed' ? 'another-credential' : null })
      );
      await act(async () => {
        await page.client.refetchQueries({ queryKey: ['credential-setup'] });
      });
      await screen.findByRole('heading', {
        name:
          status === 'expired'
            ? 'Setup expired'
            : status === 'cancelled'
              ? 'Setup cancelled'
              : 'Credential saved',
      });

      await act(async () => {
        finishExchange(savedCredential);
      });

      expect(await screen.findByText(credential.id)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open Credentials' })).toHaveAttribute(
        'href',
        '/ui/project-1/credentials'
      );
      expect(mocks.post.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
      expect(sessionStorage.getItem('credential-setup:project-1:user-1:setup-1')).toBe(
        credential.id
      );
      page.unmount();
      renderPage();
      expect(await screen.findByText(credential.id)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry completion' })).not.toBeInTheDocument();
    }
  );

  it('keeps an interrupted OAuth receipt in the original account, project and setup', async () => {
    definitions = [{ ...definition, auth: { type: 'oauth', provider: 'google' } }];
    let finishExchange!: (saved: Credential) => void;
    exchangeRequest = () =>
      new Promise(resolve => {
        finishExchange = resolve;
      });
    const first = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect with Google' }));
    await waitFor(() => {
      expect(finishExchange).toBeDefined();
    });
    first.unmount();
    mocks.user = { ...mocks.user, id: 'user-2', projectId: 'project-2' };
    setups.set('setup-2', pendingSetup({ id: 'setup-2' }));
    const other = renderPage('/ui/project-2/connect/credentials/setup-2');
    await screen.findByRole('button', { name: 'Connect with Google' });

    await act(async () => {
      finishExchange(savedCredential);
    });

    expect(sessionStorage.getItem('credential-setup:project-1:user-1:setup-1')).toBe(credential.id);
    expect(sessionStorage.getItem('credential-setup:project-2:user-2:setup-2')).toBeNull();
    expect(screen.queryByText(credential.id)).not.toBeInTheDocument();
    expect(mocks.post.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
    other.unmount();
    mocks.user = { ...mocks.user, id: 'user-1', projectId: 'project-1' };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry completion' }));

    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(
      mocks.post.mock.calls.filter(([url]) => url === '/credentials/oauth/google/exchange')
    ).toHaveLength(1);
    expect(mocks.post).toHaveBeenCalledWith(
      '/credential-setup/setup-1/complete',
      { credentialId: credential.id },
      expect.anything()
    );
  });

  it('recovers an OAuth save when a forbidden status response removes the form', async () => {
    definitions = [{ ...definition, auth: { type: 'oauth', provider: 'google' } }];
    let finishExchange!: (saved: Credential) => void;
    exchangeRequest = () =>
      new Promise(resolve => {
        finishExchange = resolve;
      });
    const page = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect with Google' }));
    await waitFor(() => {
      expect(finishExchange).toBeDefined();
    });
    setupError = Object.assign(new Error('Access denied'), { response: { status: 403 } });
    await act(async () => {
      await page.client.refetchQueries({ queryKey: ['credential-setup'] });
    });
    await screen.findByRole('heading', { name: 'Access denied' });

    await act(async () => {
      finishExchange(savedCredential);
    });

    expect(await screen.findByText(credential.id)).toBeInTheDocument();
    expect(mocks.post.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
    setupError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry completion' }));

    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(
      mocks.post.mock.calls.filter(([url]) => url === '/credentials/oauth/google/exchange')
    ).toHaveLength(1);
  });

  it("does not reuse another setup request's saved Credential", async () => {
    completeError = new Error('Network unavailable');
    const page = renderPage();
    await saveNewCredential();
    await screen.findByRole('button', { name: 'Retry completion' });
    setups.set('setup-2', pendingSetup({ id: 'setup-2' }));

    await act(async () => {
      await page.router.navigate('/ui/project-1/connect/credentials/setup-2');
    });

    expect(await screen.findByPlaceholderText('Enter Credential name')).toHaveValue('GitHub');
    expect(screen.queryByRole('button', { name: 'Retry completion' })).not.toBeInTheDocument();
  });

  it('ignores a previous setup completion when navigating to another request', async () => {
    let resolveComplete!: (value: CredentialSetup) => void;
    completeRequest = () =>
      new Promise(resolve => {
        resolveComplete = resolve;
      });
    const page = renderPage();
    await saveNewCredential();
    await screen.findByText('Finishing setup…');
    setups.set('setup-2', pendingSetup({ id: 'setup-2' }));

    await act(async () => {
      await page.router.navigate('/ui/project-1/connect/credentials/setup-2');
    });
    await screen.findByPlaceholderText('Enter Credential name');
    await act(async () => {
      resolveComplete(pendingSetup({ status: 'completed', credentialId: credential.id }));
    });

    expect(screen.getByPlaceholderText('Enter Credential name')).toHaveValue('GitHub');
    expect(screen.queryByRole('heading', { name: 'Credential saved' })).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'waits for fresh Credential metadata on a new setup (user changed=%s)',
    async changeUser => {
      setups.set('setup-1', pendingSetup({ mode: 'update', credentialId: credential.id }));
      const page = renderPage();
      expect(await screen.findByPlaceholderText('Enter Credential name')).toHaveValue(
        'Production account'
      );
      if (changeUser) mocks.user = { ...mocks.user, id: 'user-2' };
      setups.set(
        'setup-2',
        pendingSetup({ id: 'setup-2', mode: 'update', credentialId: credential.id })
      );
      let resolveCredential: ((value: Credential) => void) | undefined;
      credentialRequest = () =>
        new Promise(resolve => {
          resolveCredential = resolve;
        });

      await act(async () => {
        await page.router.navigate('/ui/project-1/connect/credentials/setup-2');
      });
      await waitFor(() => {
        expect(resolveCredential).toBeDefined();
      });
      expect(await screen.findByText('Loading setup…')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter Credential name')).not.toBeInTheDocument();
      await act(async () => {
        resolveCredential?.({ ...credential, title: 'Current account name' });
      });

      expect(await screen.findByPlaceholderText('Enter Credential name')).toHaveValue(
        'Current account name'
      );
    }
  );

  it('keeps the form available when saving fails without completing setup', async () => {
    saveError = Object.assign(new Error('Provider rejected the key'), {
      response: { status: 400, data: { message: 'Provider rejected the key' } },
    });
    renderPage();
    await saveNewCredential();

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider rejected the key');
    expect(screen.getByLabelText('Personal access token')).toHaveValue('private-provider-token');
    expect(mocks.post).toHaveBeenCalledWith(
      '/credentials',
      expect.anything(),
      expect.objectContaining({ skipErrorToast: true })
    );
    expect(mocks.post.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it('preserves unsaved input when a background status refresh fails', async () => {
    const page = renderPage();
    fireEvent.change(await screen.findByPlaceholderText('Enter Credential name'), {
      target: { value: 'Unsaved name' },
    });
    setupError = new Error('Network unavailable');

    await act(async () => {
      await page.client.refetchQueries({ queryKey: ['credential-setup'] });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByPlaceholderText('Enter Credential name')).toHaveValue('Unsaved name');
  });

  it('does not replace completed setup with an earlier status response', async () => {
    const page = renderPage();
    await screen.findByPlaceholderText('Enter Credential name');
    const stale = pendingSetup();
    let resolveSetup!: (value: CredentialSetup) => void;
    setupRequest = () =>
      new Promise(resolve => {
        resolveSetup = resolve;
      });
    await act(async () => {
      void page.client.refetchQueries({ queryKey: ['credential-setup'] });
      await Promise.resolve();
    });
    await saveNewCredential();
    await screen.findByRole('heading', { name: 'Credential saved' });

    await act(async () => {
      resolveSetup(stale);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry completion' })).not.toBeInTheDocument();
  });

  it.each([
    ['completed', 'Credential saved'],
    ['cancelled', 'Setup cancelled'],
    ['expired', 'Setup expired'],
  ] as const)('shows the server %s state without another form', async (status, heading) => {
    setups.set(
      'setup-1',
      pendingSetup({ status, credentialId: status === 'completed' ? credential.id : null })
    );
    renderPage();

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('shows a missing provider instead of silently selecting another provider', async () => {
    setups.set('setup-1', pendingSetup({ definitionId: 'removed-provider' }));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Provider unavailable' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'explains a removed setup and preserves any saved Credential ID (saved: %s)',
    async saved => {
      setupError = Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 },
      });
      if (saved) {
        sessionStorage.setItem('credential-setup:project-1:user-1:setup-1', credential.id);
      }
      renderPage();

      expect(
        await screen.findByRole('heading', { name: 'Setup link unavailable' })
      ).toBeInTheDocument();
      expect(screen.getByText(/return to your chat to request a new link/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
      if (saved) {
        expect(screen.getByText(credential.id)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open Credentials' })).toHaveAttribute(
          'href',
          '/ui/project-1/credentials'
        );
      }
    }
  );

  it('shows unavailable OAuth instead of an empty provider form', async () => {
    definitions = [{ ...definition, auth: { type: 'oauth', provider: 'google' } }];
    oauthAvailable = false;
    renderPage();

    expect(await screen.findByText(/Google sign-in is not configured/)).toBeInTheDocument();
    expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
  });

  it.each([
    ['create', 'network'],
    ['create', '503'],
    ['update', 'network'],
    ['update', '503'],
  ] as const)('recovers OAuth %s setup after a settings %s error', async (mode, failure) => {
    const oauthDefinition: CredentialDefinition = {
      ...definition,
      auth: { type: 'oauth', provider: 'google', client: 'destination' },
    };
    definitions = [oauthDefinition];
    savedCredential = {
      ...credential,
      definition: oauthDefinition,
      validationState: 'rejected',
    };
    setups.set(
      'setup-1',
      pendingSetup({ mode, credentialId: mode === 'update' ? credential.id : null })
    );
    oauthSettingsError =
      failure === 'network'
        ? new Error('Network unavailable')
        : Object.assign(new Error('Service unavailable'), { response: { status: 503 } });
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText(/Google sign-in is not configured/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    oauthSettingsError = null;
    let finishSettings!: (settings: { available: boolean }) => void;
    oauthSettingsRequest = () =>
      new Promise(resolve => {
        finishSettings = resolve;
      });
    fireEvent.click(retry);
    expect(await screen.findByText('Loading setup…')).toBeInTheDocument();
    await act(async () => {
      finishSettings({ available: true });
    });

    expect(await screen.findByRole('button', { name: 'Connect with Google' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(
      mocks.get.mock.calls.filter(([url]) => url === '/credentials/oauth/google/settings')
    ).toHaveLength(2);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('shows unavailable OAuth only after a settings retry confirms it', async () => {
    definitions = [{ ...definition, auth: { type: 'oauth', provider: 'google' } }];
    oauthSettingsError = new Error('Network unavailable');
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Try again' });
    oauthSettingsError = null;
    oauthAvailable = false;
    fireEvent.click(retry);

    expect(await screen.findByText(/Google sign-in is not configured/)).toBeInTheDocument();
    expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
  });

  it('allows token setup when Google OAuth settings cannot be loaded', async () => {
    oauthSettingsError = new Error('Network unavailable');
    renderPage();

    await saveNewCredential();

    expect(await screen.findByRole('heading', { name: 'Credential saved' })).toBeInTheDocument();
  });

  it('preserves OAuth form input when a background settings request fails', async () => {
    definitions = [{ ...definition, auth: { type: 'oauth', provider: 'google' } }];
    const page = renderPage();
    fireEvent.change(await screen.findByPlaceholderText('Enter Credential name'), {
      target: { value: 'Unsaved Google account name' },
    });
    oauthSettingsError = new Error('Network unavailable');

    await act(async () => {
      await page.client.refetchQueries({ queryKey: ['credential-google-oauth-settings'] });
    });

    expect(screen.getByPlaceholderText('Enter Credential name')).toHaveValue(
      'Unsaved Google account name'
    );
    expect(screen.getByRole('button', { name: 'Connect with Google' })).toBeEnabled();
    expect(screen.queryByText(/Google sign-in is not configured/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it.each(['setup', 'credential'] as const)(
    'does not render the form after a forbidden %s response',
    async resource => {
      const forbidden = Object.assign(new Error('Access denied'), {
        response: { status: 403, data: { message: 'Access denied' } },
      });
      if (resource === 'setup') setupError = forbidden;
      else {
        setups.set('setup-1', pendingSetup({ mode: 'update', credentialId: credential.id }));
        credentialError = forbidden;
      }
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
      expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
    }
  );

  it('keeps maintenance controls hidden when the Credential is read-only', async () => {
    setups.set('setup-1', pendingSetup({ mode: 'update', credentialId: credential.id }));
    savedCredential = { ...credential, availableForMaintenance: false };
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(screen.queryByTestId('credentialConfigForm')).not.toBeInTheDocument();
  });

  it.each(['setup', 'definitions'] as const)('recovers a failed %s load', async resource => {
    if (resource === 'setup') setupError = new Error('Network unavailable');
    else definitionsError = new Error('Network unavailable');
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Try again' });
    setupError = definitionsError = null;
    fireEvent.click(retry);
    expect(await screen.findByPlaceholderText('Enter Credential name')).toBeInTheDocument();
  });

  it('keeps cancellation retryable and does not save a Credential', async () => {
    cancelError = new Error('Network unavailable');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not cancel setup/i);
    cancelError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('heading', { name: 'Setup cancelled' })).toBeInTheDocument();
    expect(mocks.post.mock.calls.filter(([url]) => url === '/credentials')).toHaveLength(0);
    expect(
      mocks.post.mock.calls.filter(([url]) => url === '/credential-setup/setup-1/cancel')
    ).toHaveLength(2);
  });
});
