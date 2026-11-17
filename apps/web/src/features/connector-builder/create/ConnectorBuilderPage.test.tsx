import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addParameter, editCell } from './parameters-test-helpers';

const create = vi.fn();
const getById = vi.fn();
const getVersion = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const softDelete = vi.fn();
const runTest = vi.fn();
const updateLogo = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = saveDraft;
    updateLogo = updateLogo;
    publish = publish;
    getVersion = getVersion;
    softDelete = softDelete;
    test = runTest;
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

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
      warnings: [],
      stoppingDataMarts: [],
      hiddenStoppingCount: 0,
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

  it('shows what publishing warned about', async () => {
    const warning =
      'Connector \'MyApi\' v1: "authentication" references undeclared parameter(s) Token.';
    publish.mockResolvedValue({
      version: 1,
      status: 'published',
      publishedAt: '2026-06-11T00:00:00Z',
      warnings: [warning],
      stoppingDataMarts: [],
      hiddenStoppingCount: 0,
    });
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(warning, expect.objectContaining({ icon: '⚠️' }));
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
   * The connector row that lists and pickers read takes its title, description and docs link
   * from the version being published, not from a draft; the draft carries them in the manifest.
   */
  it('saves an edited title into the draft and leaves the connector row to publish', async () => {
    saveDraft.mockResolvedValue({ version: 1, status: 'draft', publishedAt: null });
    getVersion.mockResolvedValue({ version: 1, status: 'draft', manifest: EXISTING_MANIFEST });
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByPlaceholderText('My Custom API'), {
      target: { value: 'Renamed API' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(getById).toHaveBeenCalledTimes(2);
    });
    expect(saveDraft).toHaveBeenCalledWith(
      'def-1',
      expect.objectContaining({ title: 'Renamed API' })
    );
    expect(updateLogo).not.toHaveBeenCalled();
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

    // create() stored the manifest, so the next save needs an edit to have something to save.
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), { target: { value: 'My API' } });
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
            resolve({
              version: 1,
              status: 'published',
              publishedAt: '2026-06-11T00:00:00Z',
              warnings: [],
              stoppingDataMarts: [],
              hiddenStoppingCount: 0,
            });
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

/**
 * Code mode pushes the text into the builder a quarter second after the last keystroke, so
 * an action taken sooner than that must take the text itself.
 */
describe('ConnectorBuilderPage — Code mode text typed right before an action', () => {
  const draftDetail = (versions: { version: number; status: string }[]) => ({
    id: 'def-1',
    name: 'MyApi',
    title: 'My API',
    description: null,
    logo: null,
    docUrl: null,
    activeVersionId: null,
    versions: versions.map(v => ({ ...v, publishedAt: null })),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'def-1', name: 'MyApi', title: 'My API' });
    getById.mockResolvedValue(draftDetail([{ version: 1, status: 'draft' }]));
    saveDraft.mockResolvedValue({ version: 1, status: 'draft', publishedAt: null });
    publish.mockResolvedValue({ version: 1, status: 'published', publishedAt: null, warnings: [] });
    runTest.mockResolvedValue({ rows: [], logs: [] });
  });

  /** Rewrites the manifest in Code mode, as typing there does. No time passes after it. */
  const typeInCode = (change: (manifest: Record<string, any>) => void) => {
    const editor = screen.getByTestId<HTMLTextAreaElement>('monaco');
    const manifest = JSON.parse(editor.value) as Record<string, any>;
    change(manifest);
    fireEvent.change(editor, { target: { value: JSON.stringify(manifest, null, 2) } });
  };

  /** A connector saved once, so nothing is left unsaved, open in Code mode. */
  const savedConnectorInCode = async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(getById).toHaveBeenCalledWith('def-1');
    });
    fireEvent.click(screen.getByTestId('mode-code'));
  };

  it('Save draft saves it', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByTestId('mode-code'));

    typeInCode(m => {
      m.title = 'Typed just now';
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.title).toBe('Typed just now');
  });

  it('Publish saves it before publishing', async () => {
    await savedConnectorInCode();

    typeInCode(m => {
      m.title = 'Typed just now';
    });
    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('def-1');
    });
    expect(saveDraft).toHaveBeenCalledWith(
      'def-1',
      expect.objectContaining({ title: 'Typed just now' })
    );
  });

  it('Run test tests it', async () => {
    await savedConnectorInCode();
    typeInCode(m => {
      m.nodes = {
        items: { request: { method: 'GET', path: '/v1' }, recordSelector: { recordPath: [] } },
      };
    });
    await waitFor(() => {
      expect(screen.getByTestId('run-test')).toBeEnabled();
    });

    typeInCode(m => {
      m.nodes.items.request.path = '/v2';
    });
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(runTest).toHaveBeenCalledTimes(1);
    });
    expect(runTest.mock.calls[0][0].manifest.nodes.items.request.path).toBe('/v2');
  });

  it('shows a failed run above the rows the test did read', async () => {
    runTest.mockResolvedValue({
      rows: [{ id: 'row-from-account-1' }],
      logs: [],
      error: 'Error processing account acct-2: HTTP 404: Not Found',
    });
    await savedConnectorInCode();
    typeInCode(m => {
      m.nodes = {
        items: { request: { method: 'GET', path: '/v1' }, recordSelector: { recordPath: [] } },
      };
    });
    await waitFor(() => {
      expect(screen.getByTestId('run-test')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('run-test'));

    expect(await screen.findByTestId('test-error')).toHaveTextContent('HTTP 404');
    expect(screen.getByTestId('test-results')).toHaveTextContent('row-from-account-1');
  });

  it('opening another version asks before discarding it', async () => {
    getById.mockResolvedValue(
      draftDetail([
        { version: 1, status: 'published' },
        { version: 2, status: 'draft' },
      ])
    );
    await savedConnectorInCode();

    typeInCode(m => {
      m.title = 'Typed just now';
    });
    fireEvent.click(screen.getByTestId('version-badge'));
    fireEvent.click(within(screen.getByTestId('version-row-1')).getByText('v1'));

    expect(await screen.findByText('Discard changes & open version')).toBeInTheDocument();
    expect(getVersion).not.toHaveBeenCalled();
  });

  it('an edit made while the save is in flight stays unsaved', async () => {
    await savedConnectorInCode();
    fireEvent.click(screen.getByTestId('mode-builder'));
    let releaseSave!: () => void;
    saveDraft.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = () => {
            resolve({ version: 1, status: 'draft', publishedAt: null });
          };
        })
    );
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByPlaceholderText('https://api.example.com'), {
      target: { value: 'https://api.example.org' },
    });
    releaseSave();

    await waitFor(() => {
      expect(getById).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled();
    });
  });
});

describe('ConnectorBuilderPage — publishing with an older version open', () => {
  const detail = {
    id: 'def-1',
    name: 'MyApi',
    title: 'My API',
    description: null,
    logo: null,
    docUrl: null,
    activeVersionId: 'version-1',
    activeVersion: 1,
    versions: [
      { version: 1, status: 'published', publishedAt: '2026-06-01T00:00:00Z' },
      { version: 2, status: 'draft', publishedAt: null },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue(detail);
    getVersion.mockImplementation((_id: string, version: number) =>
      Promise.resolve({
        version,
        status: version === 1 ? 'published' : 'draft',
        manifest: { ...EXISTING_MANIFEST, baseUrl: `https://v${String(version)}.example.com` },
      })
    );
    saveDraft.mockResolvedValue({ version: 2, status: 'draft', publishedAt: null });
    publish.mockResolvedValue({ version: 2, status: 'published', publishedAt: null, warnings: [] });
  });

  // Discard reloaded the newest version, so the author was moved off the one they had open.
  it('discards back to the open version, not the newest', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    const baseUrl = () => screen.getByPlaceholderText('https://api.example.com');
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v2.example.com');
    });
    fireEvent.click(screen.getByTestId('version-badge'));
    fireEvent.click(within(screen.getByTestId('version-row-1')).getByText('v1'));
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v1.example.com');
    });
    fireEvent.change(baseUrl(), { target: { value: 'https://edited.example.com' } });

    fireEvent.pointerDown(screen.getByTestId('builder-more'), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId('builder-reset'));
    fireEvent.click(await screen.findByRole('button', { name: /^discard$/i }));

    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v1.example.com');
    });
    expect(getVersion).toHaveBeenLastCalledWith('def-1', 1);
  });

  // The reload's error was stored where nothing showed it, and "Changes discarded" was shown
  // over the edits that were still on screen.
  it('says so when the reload behind Discard fails', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    const baseUrl = () => screen.getByPlaceholderText('https://api.example.com');
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v2.example.com');
    });
    fireEvent.change(baseUrl(), { target: { value: 'https://edited.example.com' } });
    getVersion.mockRejectedValue(new Error('Network Error'));

    fireEvent.pointerDown(screen.getByTestId('builder-more'), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId('builder-reset'));
    fireEvent.click(await screen.findByRole('button', { name: /^discard$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network Error');
    });
    expect(toast.success).not.toHaveBeenCalledWith('Changes discarded');
  });

  it('says so when a version fails to open', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    const baseUrl = () => screen.getByPlaceholderText('https://api.example.com');
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v2.example.com');
    });
    getVersion.mockRejectedValue(new Error('Network Error'));

    fireEvent.click(screen.getByTestId('version-badge'));
    fireEvent.click(within(screen.getByTestId('version-row-1')).getByText('v1'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network Error');
    });
  });

  it('publishes the open version, as "Replace & publish" says, with nothing edited', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    const baseUrl = () => screen.getByPlaceholderText('https://api.example.com');
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v2.example.com');
    });
    fireEvent.click(screen.getByTestId('version-badge'));
    fireEvent.click(within(screen.getByTestId('version-row-1')).getByText('v1'));
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://v1.example.com');
    });

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace & publish' }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('def-1');
    });
    expect(saveDraft).toHaveBeenCalledWith(
      'def-1',
      expect.objectContaining({ baseUrl: 'https://v1.example.com' })
    );
    expect(saveDraft.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0]);
  });
});

describe('ConnectorBuilderPage — nothing to publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: 'version-1',
      activeVersion: 1,
      versions: [{ version: 1, status: 'published', publishedAt: '2026-06-01T00:00:00Z' }],
    });
    getVersion.mockResolvedValue({ version: 1, status: 'published', manifest: EXISTING_MANIFEST });
  });

  it('offers Publish only once something changed since the newest version was published', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    const baseUrl = () => screen.getByPlaceholderText('https://api.example.com');
    await waitFor(() => {
      expect(baseUrl()).toHaveValue('https://api.example.com');
    });

    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();

    fireEvent.change(baseUrl(), { target: { value: 'https://api.example.org' } });
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeEnabled();
  });
});

describe('ConnectorBuilderPage — a connector that could not be opened', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The builder stayed open and empty, and a Save from it created a second connector.
  it('says so, offers to try again, and leaves nothing to save', async () => {
    getById.mockRejectedValueOnce(new Error('Network Error'));
    getById.mockResolvedValueOnce({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 1, status: 'draft', publishedAt: null }],
    });
    getVersion.mockResolvedValue({ version: 1, status: 'draft', manifest: EXISTING_MANIFEST });
    render(<ConnectorBuilderPage id='def-1' />);

    expect(await screen.findByTestId('builder-load-failed')).toHaveTextContent('Network Error');
    expect(screen.queryByRole('button', { name: /save draft/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://api.example.com')).toHaveValue(
        'https://api.example.com'
      );
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ConnectorBuilderPage — connector icon', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const SVG_URI = `data:image/svg+xml;base64,${btoa(SVG)}`;
  const SAVED_URI = 'data:image/png;base64,c2F2ZWQ=';

  const uploadIcon = () => {
    fireEvent.change(screen.getByTestId('connectorLogoInput'), {
      target: { files: [new File([SVG], 'logo.svg', { type: 'image/svg+xml' })] },
    });
  };
  const preview = () => screen.queryByRole('img', { name: 'icon' });

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'def-1', name: 'MyApi', title: 'My API' });
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: SAVED_URI,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 1, status: 'draft', publishedAt: null }],
    });
    getVersion.mockResolvedValue({ version: 1, status: 'draft', manifest: EXISTING_MANIFEST });
    saveDraft.mockResolvedValue({ version: 1, status: 'draft', publishedAt: null });
    updateLogo.mockResolvedValue(undefined);
  });

  it('creates a new connector with the uploaded icon', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    uploadIcon();
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SVG_URI);
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ logo: SVG_URI }));
    });
    expect(updateLogo).not.toHaveBeenCalled();
  });

  it('saves a removed icon of an existing connector', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SAVED_URI);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));
    expect(preview()).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Custom connector' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload icon' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(updateLogo).toHaveBeenCalledWith('def-1', null);
    });
    expect(saveDraft).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Icon saved');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    });
  });

  // A save wrote the unchanged manifest too, and on a published connector that added a version.
  it('saves the icon of a published connector without adding a version', async () => {
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: SAVED_URI,
      docUrl: null,
      activeVersionId: 'version-1',
      activeVersion: 1,
      versions: [{ version: 1, status: 'published', publishedAt: '2026-06-01T00:00:00Z' }],
    });
    getVersion.mockResolvedValue({ version: 1, status: 'published', manifest: EXISTING_MANIFEST });
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SAVED_URI);
    });

    uploadIcon();
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SVG_URI);
    });
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(updateLogo).toHaveBeenCalledWith('def-1', SVG_URI);
    });
    expect(saveDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('version-badge')).toHaveTextContent('v1 · published');
  });

  describe('with an older version open over a newer draft', () => {
    beforeEach(() => {
      getById.mockResolvedValue({
        id: 'def-1',
        name: 'MyApi',
        title: 'My API',
        description: null,
        logo: SAVED_URI,
        docUrl: null,
        activeVersionId: 'version-1',
        activeVersion: 1,
        versions: [
          { version: 1, status: 'published', publishedAt: '2026-06-01T00:00:00Z' },
          { version: 2, status: 'draft', publishedAt: null },
        ],
      });
      getVersion.mockImplementation((_id: string, version: number) =>
        Promise.resolve({
          version,
          status: version === 1 ? 'published' : 'draft',
          manifest: { ...EXISTING_MANIFEST, baseUrl: `https://v${String(version)}.example.com` },
        })
      );
      publish.mockResolvedValue({
        version: 2,
        status: 'published',
        publishedAt: null,
        warnings: [],
        stoppingDataMarts: [],
        hiddenStoppingCount: 0,
      });
    });

    const openVersionOne = async () => {
      render(<ConnectorBuilderPage id='def-1' />);
      const baseUrl = () => screen.getByPlaceholderText('https://api.example.com');
      await waitFor(() => {
        expect(baseUrl()).toHaveValue('https://v2.example.com');
      });
      fireEvent.click(screen.getByTestId('version-badge'));
      fireEvent.click(within(screen.getByTestId('version-row-1')).getByText('v1'));
      await waitFor(() => {
        expect(baseUrl()).toHaveValue('https://v1.example.com');
      });
      uploadIcon();
      await waitFor(() => {
        expect(preview()).toHaveAttribute('src', SVG_URI);
      });
    };

    it('saves the icon alone without replacing the newer draft', async () => {
      await openVersionOne();

      fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

      await waitFor(() => {
        expect(updateLogo).toHaveBeenCalledWith('def-1', SVG_URI);
      });
      expect(screen.queryByText('Replace the newest draft?')).not.toBeInTheDocument();
      expect(saveDraft).not.toHaveBeenCalled();
    });

    it('still replaces the newer draft when Publish is confirmed', async () => {
      await openVersionOne();

      fireEvent.click(screen.getByRole('button', { name: /publish/i }));
      fireEvent.click(await screen.findByRole('button', { name: 'Replace & publish' }));

      await waitFor(() => {
        expect(publish).toHaveBeenCalledWith('def-1');
      });
      expect(saveDraft).toHaveBeenCalledWith(
        'def-1',
        expect.objectContaining({ baseUrl: 'https://v1.example.com' })
      );
      expect(updateLogo).toHaveBeenCalledWith('def-1', SVG_URI);
    });
  });

  it('keeps the saved draft and says so when only the icon fails to save', async () => {
    updateLogo.mockRejectedValue(new Error('Network Error'));
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SAVED_URI);
    });
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), {
      target: { value: 'Renamed API' },
    });
    uploadIcon();
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SVG_URI);
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('The icon was not saved:'));
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Draft saved');
    expect(screen.getByRole('button', { name: /save draft/i })).toBeEnabled();
  });

  it('discards an uploaded icon back to the saved one', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SAVED_URI);
    });
    uploadIcon();
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SVG_URI);
    });

    fireEvent.pointerDown(screen.getByTestId('builder-more'), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId('builder-reset'));
    fireEvent.click(await screen.findByRole('button', { name: /^discard$/i }));

    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SAVED_URI);
    });
    expect(updateLogo).not.toHaveBeenCalled();
  });

  it('shows why a file cannot be an icon and keeps the saved one', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(preview()).toHaveAttribute('src', SAVED_URI);
    });

    fireEvent.change(screen.getByTestId('connectorLogoInput'), {
      target: { files: [new File(['GIF89a'], 'logo.gif', { type: 'image/gif' })] },
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('logo.gif is not an SVG, PNG, JPEG or WebP image.');
    });
    expect(preview()).toHaveAttribute('src', SAVED_URI);
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
  });
});
