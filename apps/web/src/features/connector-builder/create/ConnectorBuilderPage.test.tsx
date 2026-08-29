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
const updateMetadata = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = saveDraft;
    publish = publish;
    getVersion = getVersion;
    softDelete = softDelete;
    updateMetadata = updateMetadata;
  },
}));

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** What the builder reads into itself when it opens an existing connector. */
const EXISTING_MANIFEST = {
  version: '1.0',
  name: 'MyApi',
  title: 'My API',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {},
};

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
    updateMetadata.mockResolvedValue({
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

  it('locks the connector name once the connector exists', async () => {
    render(<ConnectorBuilderPage />);
    expect(screen.getByPlaceholderText('MyCustomApi')).not.toHaveAttribute('readonly');
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });

    // Only create() writes the definition row's name, and that name is what data marts
    // resolve a connector by. Editing this afterwards renames the manifest alone: the
    // builder would show the new name and every other surface the old one, forever.
    expect(screen.getByPlaceholderText('MyCustomApi')).toHaveAttribute('readonly');
  });

  /**
   * The builder edits the manifest, but the connectors list, the picker and every data-mart
   * page read the connector's ROW — seeded from the manifest at create and, before this,
   * never updated. A retitled connector saved cleanly and kept its old title everywhere the
   * user would actually look for it, with nothing to say why.
   */
  it('sends an edited title to the connector row, not only into the manifest', async () => {
    saveDraft.mockResolvedValue({ version: 1, status: 'draft', publishedAt: null });
    getVersion.mockResolvedValue({ version: 1, status: 'draft', manifest: EXISTING_MANIFEST });
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByPlaceholderText('My Custom API'), {
      target: { value: 'Renamed API' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(updateMetadata).toHaveBeenCalledWith(
        'def-1',
        expect.objectContaining({ title: 'Renamed API' })
      );
    });
    // The name is what data marts resolve the connector by, so it is never part of the update.
    expect(updateMetadata.mock.calls[0][1]).not.toHaveProperty('name');
  });

  /**
   * An emptied optional field has to clear the column, not store `''`: the row is read by
   * screens that render these only when present, and an empty string is present.
   */
  it('clears an emptied description rather than storing a blank', async () => {
    saveDraft.mockResolvedValue({ version: 1, status: 'draft', publishedAt: null });
    getVersion.mockResolvedValue({
      version: 1,
      status: 'draft',
      manifest: { ...EXISTING_MANIFEST, description: 'Something' },
    });
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: 'Something',
      logo: null,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 1, status: 'draft', publishedAt: null }],
    });
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(updateMetadata).toHaveBeenCalledWith(
        'def-1',
        expect.objectContaining({ description: null })
      );
    });
  });

  it('keeps the created id when the read that follows create fails', async () => {
    // create() has already taken the name, so re-POSTing it 400s on the name check.
    // If the id is discarded with the failed read, every retry takes that path and the
    // session can never save again.
    getById.mockRejectedValueOnce(new Error('Network Error'));
    saveDraft.mockResolvedValue({ version: 1, status: 'draft', publishedAt: null });
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(getById).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledWith('def-1', expect.anything());
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not announce the new id until the publish that created it has landed', async () => {
    // The announcement swaps /connectors/builder/new → /:id, and those are different
    // route elements: the whole page remounts and reloads the connector. Remounting
    // mid-publish reloads it pre-publish — a draft under a "Published" toast.
    let releasePublish!: () => void;
    publish.mockImplementation(
      () =>
        new Promise(resolve => {
          releasePublish = () => {
            resolve({ version: 1, status: 'published', publishedAt: '2026-06-11T00:00:00Z' });
          };
        })
    );
    const onCreated = vi.fn();
    render(<ConnectorBuilderPage onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('def-1');
    });
    expect(onCreated).not.toHaveBeenCalled();

    releasePublish();
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
