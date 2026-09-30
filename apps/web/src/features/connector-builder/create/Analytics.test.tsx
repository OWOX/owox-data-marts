import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { trackEvent } from '../../../utils/data-layer';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const create = vi.fn();
const getById = vi.fn();
const getVersion = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const softDelete = vi.fn();
const activateVersion = vi.fn();
const runTest = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    getVersion = getVersion;
    saveDraft = saveDraft;
    publish = publish;
    softDelete = softDelete;
    activateVersion = activateVersion;
    test = runTest;
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));
vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value }: { value: string }) => (
    <textarea data-testid='monaco' value={value} readOnly />
  ),
}));

const MANIFEST = {
  version: '1.0',
  name: 'MyApi',
  title: 'My API',
  baseUrl: 'https://api.example.com/v2',
  parameters: {},
  nodes: {
    items: {
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: ['data'] },
      fields: {},
    },
  },
};

const detail = (
  versions: { version: number; status: 'draft' | 'published' }[],
  active: number
) => ({
  id: 'def-1',
  name: 'MyApi',
  title: 'My API',
  description: null,
  logo: null,
  docUrl: null,
  activeVersionId: `v${active}-id`,
  activeVersion: active,
  versions: versions.map(v => ({
    ...v,
    publishedAt: v.status === 'published' ? '2026-09-01' : null,
  })),
});

/** Every event this page sent, by name. */
const sent = (event: string) =>
  vi
    .mocked(trackEvent)
    .mock.calls.map(([payload]) => payload)
    .filter(payload => payload.event === event);

function openMoreActions() {
  fireEvent.pointerDown(screen.getByTestId('builder-more'), { button: 0, ctrlKey: false });
}

async function renderExisting() {
  render(<ConnectorBuilderPage id='def-1' entryPoint='connectors_list' />);
  await waitFor(() => {
    expect(screen.getByTestId('builder-topbar').textContent).toContain('MyApi');
  });
}

function startNewConnector() {
  render(<ConnectorBuilderPage entryPoint='data_mart_wizard' />);
  fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
  fireEvent.change(screen.getByPlaceholderText('https://api.example.com'), {
    target: { value: 'https://api.example.com/v2' },
  });
  fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
  fireEvent.click(screen.getByRole('button', { name: /add node/i }));
}

describe('Connector builder analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    create.mockResolvedValue({ id: 'def-1', name: 'MyApi', title: 'My API' });
    getById.mockResolvedValue(detail([{ version: 1, status: 'published' }], 1));
    getVersion.mockResolvedValue({ version: 1, status: 'published', manifest: MANIFEST });
    publish.mockResolvedValue({
      version: 1,
      status: 'published',
      publishedAt: '',
      warnings: ['w'],
    });
    runTest.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }],
      logs: [],
      error: null,
      sample: [{ id: 1 }],
    });
  });

  it('reports a new connector opened from the Data Mart wizard', () => {
    render(<ConnectorBuilderPage entryPoint='data_mart_wizard' />);

    expect(sent('custom_connector_builder_opened')).toEqual([
      expect.objectContaining({ mode: 'new', entryPoint: 'data_mart_wizard', connectorId: null }),
    ]);
  });

  it('reports an existing connector once, after it has loaded', async () => {
    await renderExisting();

    expect(sent('custom_connector_builder_opened')).toEqual([
      expect.objectContaining({
        mode: 'edit',
        entryPoint: 'connectors_list',
        connectorId: 'def-1',
        connectorName: 'MyApi',
        apiHost: 'api.example.com',
        nodesCount: 1,
      }),
    ]);
  });

  it('reports the first save as created, with where the manifest came from', async () => {
    startNewConnector();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(sent('custom_connector_created')).toEqual([
        expect.objectContaining({ connectorId: 'def-1', connectorName: 'MyApi', origin: 'form' }),
      ]);
    });
  });

  it('reports a publish with its version and warnings', async () => {
    await renderExisting();
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), { target: { value: 'Mine' } });
    getById.mockResolvedValue(
      detail(
        [
          { version: 1, status: 'published' },
          { version: 2, status: 'published' },
        ],
        2
      )
    );
    publish.mockResolvedValue({
      version: 2,
      status: 'published',
      publishedAt: '',
      warnings: ['w'],
    });
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(sent('custom_connector_published')).toEqual([
        expect.objectContaining({ connectorId: 'def-1', version: 2, warningsCount: 1 }),
      ]);
    });
  });

  it('reports a failed publish by its kind, not its text', async () => {
    await renderExisting();
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), { target: { value: 'Mine' } });
    publish.mockRejectedValue(
      new Error('Manifest is invalid: nodes.items.request.path is required')
    );
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(sent('custom_connector_error')).toEqual([
        expect.objectContaining({ action: 'PublishError', errorKind: 'invalid_manifest' }),
      ]);
    });
    expect(JSON.stringify(sent('custom_connector_error'))).not.toContain('request.path');
  });

  it('reports each test run with its result and how many ran before it', async () => {
    startNewConnector();
    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(sent('custom_connector_test_run')).toHaveLength(1);
    });
    runTest.mockResolvedValue({ rows: [], logs: [], error: 'HTTP 401: Unauthorized — {"t":"x"}' });
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(sent('custom_connector_test_run')).toEqual([
        expect.objectContaining({
          result: 'success',
          recordsCount: 2,
          testsInSession: 1,
          node: 'items',
        }),
        expect.objectContaining({
          result: 'error',
          recordsCount: 0,
          errorKind: 'auth',
          httpStatus: 401,
          testsInSession: 2,
        }),
      ]);
    });
    expect(sent('custom_connector_test_run')[0]).toHaveProperty('durationMs');
  });

  it('reports a test that returned no records as empty', async () => {
    runTest.mockResolvedValue({ rows: [], logs: [], error: null, sample: [] });
    startNewConnector();
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(sent('custom_connector_test_run')).toEqual([
        expect.objectContaining({ result: 'empty', recordsCount: 0 }),
      ]);
    });
  });

  it('reports discovered fields with how many were found', async () => {
    runTest.mockResolvedValue({
      rows: [{ id: 1 }],
      logs: [],
      error: null,
      sample: [{ id: 1, name: 'a', meta: { tag: 'x' } }],
    });
    startNewConnector();
    fireEvent.click(screen.getByTestId('run-test'));
    const discover = await screen.findByRole('button', { name: /discover fields from sample/i });
    await waitFor(() => {
      expect(discover).not.toBeDisabled();
    });
    fireEvent.click(discover);

    expect(sent('custom_connector_fields_discovered')).toEqual([
      expect.objectContaining({ fieldsCount: 3 }),
    ]);
  });

  it('reports switching between Builder and Code', async () => {
    await renderExisting();
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.click(screen.getByTestId('mode-builder'));

    expect(sent('custom_connector_mode_switched').map(e => e.to)).toEqual(['code', 'builder']);
  });

  it('reports import from the menu and from Code, including a file that does not parse', async () => {
    await renderExisting();
    const importFile = (content: string) => {
      fireEvent.change(screen.getByTestId('builderImportInput'), {
        target: { files: [new File([content], 'm.json', { type: 'application/json' })] },
      });
    };

    openMoreActions();
    fireEvent.click(await screen.findByTestId('builderImportJson'));
    importFile(JSON.stringify({ ...MANIFEST, title: 'Imported' }));
    await waitFor(() => {
      expect(sent('custom_connector_imported')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.click(screen.getByTestId('codeImportJson'));
    importFile('{ not json');
    await waitFor(() => {
      expect(sent('custom_connector_imported')).toHaveLength(2);
    });

    expect(sent('custom_connector_imported').map(e => [e.where, e.result])).toEqual([
      ['menu', 'success'],
      ['code_tab', 'invalid'],
    ]);
  });

  it('reports a manifest imported before the first save as created from import', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.click(screen.getByTestId('codeImportJson'));
    fireEvent.change(screen.getByTestId('builderImportInput'), {
      target: { files: [new File([JSON.stringify(MANIFEST)], 'm.json')] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('builder-topbar').textContent).toContain('MyApi');
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(sent('custom_connector_created')).toEqual([
        expect.objectContaining({ origin: 'import' }),
      ]);
    });
  });

  it('reports export and the guide link', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    await renderExisting();

    openMoreActions();
    fireEvent.click(await screen.findByTestId('builderExportJson'));
    openMoreActions();
    fireEvent.click(await screen.findByTestId('builderGuide'));

    expect(sent('custom_connector_exported')).toHaveLength(1);
    expect(sent('custom_connector_guide_opened')).toEqual([
      expect.objectContaining({ guide: 'connector_builder', connectorId: 'def-1' }),
    ]);
  });

  it('reports making another version active', async () => {
    getById.mockResolvedValue(
      detail(
        [
          { version: 1, status: 'published' },
          { version: 2, status: 'published' },
        ],
        2
      )
    );
    activateVersion.mockResolvedValue({ activeVersionId: 'v1-id', activeVersion: 1 });
    await renderExisting();

    fireEvent.click(screen.getByTestId('version-badge'));
    const panel = await screen.findByTestId('version-history');
    fireEvent.click(within(panel).getByRole('button', { name: /make version 1 active/i }));

    await waitFor(() => {
      expect(sent('custom_connector_version_activated')).toEqual([
        expect.objectContaining({ version: 1, fromVersion: 2 }),
      ]);
    });
  });

  it('reports a deleted connector', async () => {
    softDelete.mockResolvedValue(undefined);
    await renderExisting();

    openMoreActions();
    fireEvent.click(await screen.findByTestId('builder-delete'));
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(sent('custom_connector_deleted')).toEqual([
        expect.objectContaining({ connectorId: 'def-1', connectorName: 'MyApi' }),
      ]);
    });
  });
});
