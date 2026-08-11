import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addParameter, editCell } from './parameters-test-helpers';

const create = vi.fn();
const getById = vi.fn();
const getVersion = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const softDelete = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = saveDraft;
    publish = publish;
    getVersion = getVersion;
    softDelete = softDelete;
  },
}));

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (v: string | undefined) => void }) => (
    <textarea
      data-testid='monaco'
      value={value}
      onChange={e => {
        onChange(e.target.value);
      }}
    />
  ),
}));

describe('ConnectorBuilderPage (new)', () => {
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
    publish.mockResolvedValue({
      version: 1,
      status: 'published',
      publishedAt: '2026-06-11T00:00:00Z',
    });
  });

  it('fills General, adds a parameter, saves (creates) then publishes', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('https://api.example.com'), {
      target: { value: 'https://api.example.com' },
    });

    fireEvent.click(screen.getByText('Parameters'));
    // Add an empty row, then name it inline (Output Schema-style).
    addParameter('Token');
    expect(screen.getByTestId('param-Token')).toBeInTheDocument();

    // Save draft — button is now enabled because dirty===true after typing into Name
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const payload = create.mock.calls[0][0];
    expect(payload.name).toBe('MyApi');
    // Title is left blank here, and it is a NOT NULL column: useBuilder must fall
    // back to the name via firstNonEmpty(manifest.title, manifest.name).
    expect(payload.title).toBe('MyApi');
    expect(payload.manifest.parameters.Token).toBeDefined();

    // Wait for state.id to be set (getById called after create) so publish uses the id directly
    await waitFor(() => {
      expect(getById).toHaveBeenCalledWith('def-1');
    });

    fireEvent.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('def-1');
    });
  });

  it('renders a Back button that calls onBack when provided', () => {
    const onBack = vi.fn();
    render(<ConnectorBuilderPage onBack={onBack} />);
    fireEvent.click(screen.getByTestId('builder-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not render a Back button when onBack is not provided', () => {
    render(<ConnectorBuilderPage />);
    expect(screen.queryByTestId('builder-back')).toBeNull();
  });

  it('renders a kebab menu with a delete action', () => {
    render(<ConnectorBuilderPage />);
    expect(screen.getByTestId('builder-more')).toBeInTheDocument();
  });

  it('reports the new connector id after the first Save draft (for the URL swap)', async () => {
    const onCreated = vi.fn();
    render(<ConnectorBuilderPage onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('def-1');
    });
  });

  it('writes a source-level rateLimit from the General editor', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('60'), { target: { value: '60' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.rateLimit).toEqual({ requests: 100, perSeconds: 60 });
  });

  it('omits rateLimit when both inputs are emptied', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    const requests = screen.getByPlaceholderText('100');
    const perSeconds = screen.getByPlaceholderText('60');
    fireEvent.change(requests, { target: { value: '100' } });
    fireEvent.change(perSeconds, { target: { value: '60' } });
    fireEvent.change(requests, { target: { value: '' } });
    fireEvent.change(perSeconds, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.rateLimit).toBeUndefined();
  });

  it('sends the authored Title instead of the name when one is filled in', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), {
      target: { value: 'My API' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].title).toBe('My API');
  });

  it('authors a parameter label and default', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByText('Parameters'));
    addParameter('Token');

    editCell('Human-friendly label', 'API Token');
    editCell('Default value', 'abc');
    editCell('Optional description', 'Bearer token');

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const param = create.mock.calls[0][0].manifest.parameters.Token;
    expect(param.label).toBe('API Token');
    expect(param.default).toBe('abc');
    expect(param.description).toBe('Bearer token');
  });
});
