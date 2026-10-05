import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
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
vi.mock('../../data-marts/model-canvas/export/download', () => ({ downloadBlob: vi.fn() }));
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

/** A refusal from OWOX itself, as the API client rejects with it. */
const apiRefusal = (status: number, data: Record<string, unknown>) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
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
    // A node without declared fields is tested sample-only: no cast rows, the records in
    // `sample` (connector-test.service.ts).
    runTest.mockResolvedValue({ rows: [], logs: [], error: null, sample: [{ id: 1 }, { id: 2 }] });
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
        apiHost: '*.example.com',
        nodesCount: 1,
        version: 1,
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

  // Where the manifest came from, not which tab is open at the first save.
  it('reports a connector written in Code mode as created from code', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.change(screen.getByTestId('monaco'), {
      target: { value: JSON.stringify(MANIFEST, null, 2) },
    });
    fireEvent.click(screen.getByTestId('mode-builder'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(sent('custom_connector_created')).toEqual([
        expect.objectContaining({ origin: 'code' }),
      ]);
    });
  });

  it('keeps form as the origin when Code mode is only looked at', async () => {
    startNewConnector();
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(sent('custom_connector_created')).toEqual([
        expect.objectContaining({ origin: 'form' }),
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
      apiRefusal(400, {
        message: 'Invalid manifest: nodes.items.request.path is required',
        code: 'BAD_REQUEST',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(sent('custom_connector_error')).toEqual([
        expect.objectContaining({
          action: 'PublishError',
          errorKind: 'invalid_manifest',
          httpStatus: 400,
          errorCode: 'BAD_REQUEST',
        }),
      ]);
    });
    expect(JSON.stringify(sent('custom_connector_error'))).not.toContain('request.path');
  });

  // A first Publish creates the connector; its refusal must name that connector, not null.
  it('reports a refused first publish against the connector it just created', async () => {
    publish.mockRejectedValue(apiRefusal(400, { message: 'Node "items" has no primary key' }));
    startNewConnector();
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(sent('custom_connector_error')).toEqual([
        expect.objectContaining({ action: 'PublishError', connectorId: 'def-1', httpStatus: 400 }),
      ]);
    });
    expect(sent('custom_connector_created')).toEqual([
      expect.objectContaining({ connectorId: 'def-1' }),
    ]);
  });

  it('does not report a publish that landed as failed when the refresh after it fails', async () => {
    await renderExisting();
    fireEvent.change(screen.getByPlaceholderText('My Custom API'), { target: { value: 'Mine' } });
    publish.mockResolvedValue({ version: 2, status: 'published', publishedAt: '', warnings: [] });
    // The save before the publish reads the connector back too; only the read after it fails.
    getById
      .mockResolvedValueOnce(detail([{ version: 1, status: 'published' }], 1))
      .mockRejectedValueOnce(apiRefusal(500, { message: 'Internal server error' }));
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(sent('custom_connector_published')).toHaveLength(1);
    });
    expect(sent('custom_connector_error')).toEqual([]);
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
          sampleOnly: true,
          testsInSession: 1,
          errorKind: null,
          httpStatus: null,
        }),
        expect.objectContaining({
          result: 'error',
          recordsCount: 0,
          sampleOnly: false,
          errorKind: 'auth',
          httpStatus: 401,
          testsInSession: 2,
        }),
      ]);
    });
    expect(sent('custom_connector_test_run')[0]).toHaveProperty('durationMs');
    // The node name is what the author typed.
    for (const run of sent('custom_connector_test_run')) expect(run).not.toHaveProperty('node');
  });

  it('does not count a test OWOX refused to start as a test run', async () => {
    runTest.mockRejectedValueOnce(
      apiRefusal(429, {
        message: 'This project already has 3 connector tests running.',
        code: 'CONNECTOR_TEST_CONCURRENCY_LIMIT',
      })
    );
    startNewConnector();
    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(sent('custom_connector_error')).toEqual([
        expect.objectContaining({
          action: 'TestError',
          errorKind: 'http_4xx',
          httpStatus: 429,
          errorCode: 'CONNECTOR_TEST_CONCURRENCY_LIMIT',
        }),
      ]);
    });
    expect(sent('custom_connector_test_run')).toEqual([]);

    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(sent('custom_connector_test_run')).toEqual([
        expect.objectContaining({ result: 'success', testsInSession: 1 }),
      ]);
    });
  });

  it('reports a test that returned no records as empty', async () => {
    runTest.mockResolvedValue({ rows: [], logs: [], error: null, sample: [] });
    startNewConnector();
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(sent('custom_connector_test_run')).toEqual([
        expect.objectContaining({ result: 'empty', recordsCount: 0, sampleOnly: false }),
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
