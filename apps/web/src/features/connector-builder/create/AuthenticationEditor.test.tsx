import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addParameter } from './parameters-test-helpers';

const create = vi.fn();
const getById = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('Builder Authentication flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'def-1', name: 'MyApi', title: 'My API' });
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 1, status: 'draft', publishedAt: null }],
    });
  });

  it('configures bearer auth and inserts a parameter into the format, saved in the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Parameters'));
    addParameter('Token');

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'Bearer' }));

    expect(screen.getByPlaceholderText('Authorization')).toHaveValue('Authorization');

    const formatInput = screen.getByPlaceholderText('Bearer {{ parameters.Token }}');
    fireEvent.change(formatInput, { target: { value: 'Bearer ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert parameter' })); // open the in-field { } picker
    fireEvent.click(screen.getByRole('button', { name: /insert parameter token/i }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const auth = create.mock.calls[0][0].manifest.authentication;
    expect(auth.type).toBe('bearer');
    expect(auth.inject.into).toBe('header');
    expect(auth.inject.format).toBe('Bearer {{ parameters.Token }}');
  });

  it('None clears the authentication block', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'API Key' }));
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.authentication).toBeUndefined();
  });

  it('configures tokenExchange with url, tokenPath and body, saved in the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'Token Exchange' }));

    fireEvent.change(screen.getByPlaceholderText('https://api.example.com/auth'), {
      target: { value: 'https://api.x.com/auth' },
    });
    fireEvent.change(screen.getByPlaceholderText('token or data.access_token'), {
      target: { value: 'data.access_token' },
    });
    fireEvent.change(screen.getByTestId('exchange-body'), {
      target: { value: '{"api_key":"{{ parameters.ApiKey }}"}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const auth = create.mock.calls[0][0].manifest.authentication;
    expect(auth.type).toBe('tokenExchange');
    expect(auth.exchange.url).toBe('https://api.x.com/auth');
    expect(auth.exchange.tokenPath).toEqual(['data', 'access_token']);
    expect(auth.exchange.body).toEqual({ api_key: '{{ parameters.ApiKey }}' });
    expect(auth.inject.format).toBe('Bearer {{ auth.token }}');
  });

  it('renders the oauth2 editor and writes the token URL into the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'OAuth2' }));

    expect(screen.getByTestId('oauth2-editor')).toBeTruthy();

    const tokenUrl = screen.getByPlaceholderText('https://oauth2.googleapis.com/token');
    fireEvent.change(tokenUrl, { target: { value: 'https://oauth.example.com/token' } });

    const ttlSeconds = screen.getByPlaceholderText('300');
    fireEvent.change(ttlSeconds, { target: { value: '120' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const auth = create.mock.calls[0][0].manifest.authentication;
    expect(auth.type).toBe('oauth2');
    expect(auth.tokenUrl).toBe('https://oauth.example.com/token');
    expect(auth.grantType).toBe('refresh_token');
    expect(auth.inject.format).toBe('Bearer {{ auth.token }}');
    expect(auth.ttlSeconds).toBe(120);
  });

  it('configures apiKey auth and edits the inject name, saved in the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'API Key' }));

    // apiKey preset name is 'api_key'; the Name input uses placeholder 'Authorization'
    const nameInput = screen.getByPlaceholderText('Authorization');
    fireEvent.change(nameInput, { target: { value: 'X-Api-Key' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const auth = create.mock.calls[0][0].manifest.authentication;
    expect(auth.type).toBe('apiKey');
    expect(auth.inject.into).toBe('query');
    expect(auth.inject.name).toBe('X-Api-Key');
    expect(auth.inject.format).toBe('{{ parameters.ApiKey }}');
  });

  it('configures basic auth (username/password), hides inject fields, saved in the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'Basic' }));

    expect(screen.getByTestId('basic-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('inject-editor')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('{{ parameters.User }}'), {
      target: { value: '{{ parameters.User }}' },
    });
    fireEvent.change(screen.getByPlaceholderText('{{ parameters.Pass }}'), {
      target: { value: '{{ parameters.Pass }}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const auth = create.mock.calls[0][0].manifest.authentication;
    expect(auth.type).toBe('basic');
    expect(auth.username).toBe('{{ parameters.User }}');
    expect(auth.password).toBe('{{ parameters.Pass }}');
  });

  it('clicking the already-selected auth type again keeps the block the author filled in', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'OAuth2' }));
    fireEvent.change(screen.getByPlaceholderText('https://oauth2.googleapis.com/token'), {
      target: { value: 'https://auth.example.com/token' },
    });
    fireEvent.change(screen.getByPlaceholderText('{{ parameters.ClientId }}'), {
      target: { value: '{{ parameters.ClientId }}' },
    });

    // Re-selecting the type that is already active must not reset the block.
    fireEvent.click(screen.getByRole('button', { name: 'OAuth2' }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const auth = create.mock.calls[0][0].manifest.authentication;
    expect(auth.tokenUrl).toBe('https://auth.example.com/token');
    expect(auth.clientId).toBe('{{ parameters.ClientId }}');
  });

  it('configures selective auth with a selection parameter and an apiKey branch, saved in the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'Selective' }));

    fireEvent.change(screen.getByLabelText('Selection parameter'), {
      target: { value: 'AuthMethod' },
    });
    fireEvent.change(screen.getByPlaceholderText('branch key'), { target: { value: 'apikey' } });
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const captured = create.mock.calls[0][0].manifest;
    expect(captured.authentication).toMatchObject({
      type: 'selective',
      selectionParameter: 'AuthMethod',
      authenticators: { apikey: { type: 'apiKey' } },
    });
  });

  it('selective auth: removing a branch does not crash the editor and omits the removed key from the manifest', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Authentication'));
    fireEvent.click(screen.getByRole('button', { name: 'Selective' }));

    // Add first branch
    fireEvent.change(screen.getByPlaceholderText('branch key'), { target: { value: 'apikey' } });
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }));

    // Add second branch
    fireEvent.change(screen.getByPlaceholderText('branch key'), { target: { value: 'basic' } });
    fireEvent.click(screen.getByRole('button', { name: /add branch/i }));

    // Both branches should be visible
    expect(screen.getByLabelText('Branch apikey type')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch basic type')).toBeInTheDocument();

    // Remove the first branch
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    // Editor must not crash — the remaining branch's controls are still queryable
    expect(screen.getByLabelText('Branch basic type')).toBeInTheDocument();
    expect(screen.queryByLabelText('Branch apikey type')).toBeNull();

    // Save and verify the manifest
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const authenticators = create.mock.calls[0][0].manifest.authentication.authenticators;
    expect(authenticators).not.toHaveProperty('apikey');
    expect(authenticators).toHaveProperty('basic');
    expect(authenticators.basic.type).toBe('apiKey');
  });
});
