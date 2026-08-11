import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addParameter } from './parameters-test-helpers';

const create = vi.fn();
const getById = vi.fn();
const test = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
    test = test;
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEST_SETTINGS_PREFIX = 'connector-builder:test-settings:';

/** Every dock-owned localStorage key currently on this device. */
function testSettingsKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(TEST_SETTINGS_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Build a one-node connector and press Run — the shortest path to whatever the dock does
 * with the result the mocked `test` call produced. */
async function runTestOnOneNode() {
  render(<ConnectorBuilderPage />);
  fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
  fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
  fireEvent.click(screen.getByRole('button', { name: /add node/i }));

  fireEvent.click(screen.getByTestId('run-test'));
  await waitFor(() => {
    expect(test).toHaveBeenCalledTimes(1);
  });
}

describe('Builder TestPanel flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
    test.mockResolvedValue({ rows: [{ id: 1, name: 'alpha' }], logs: ['starting'], error: null });
  });

  it('runs a test with the in-editor manifest + parameter values and renders the rows', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Parameters'));
    addParameter('Token');

    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // Parameter values now live in the dock's gear settings panel — open it, fill, run from there.
    fireEvent.click(screen.getByTestId('test-settings-gear'));
    const tokenInput = await screen.findByPlaceholderText('Token');
    fireEvent.change(tokenInput, { target: { value: 'secret-token' } });

    fireEvent.click(screen.getByTestId('run-test-settings'));

    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    const payload = test.mock.calls[0][0];
    expect(payload.node).toBe('items');
    expect(payload.configuration).toEqual({ Token: 'secret-token' });
    expect(payload.maxRows).toBe(25);
    expect(payload.manifest.nodes.items).toBeDefined();
    expect(payload.manifest.parameters.Token).toBeDefined();

    expect(await screen.findByText('alpha')).toBeInTheDocument();

    // Nothing is written to this device yet: the connector has no id, so there is no
    // bucket that belongs to it (see "test settings persistence" below).
    expect(testSettingsKeys()).toEqual([]);
  });

  it('switches the result view between table, JSON, and logs (default table)', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });

    // default view is the table → the row value is visible
    expect(await screen.findByText('alpha')).toBeInTheDocument();

    // JSON view → the full, untruncated rows as pretty JSON
    fireEvent.click(screen.getByTestId('view-json'));
    expect(screen.getByTestId('test-json').textContent).toContain('"name": "alpha"');

    // Logs view → the connector's log lines
    fireEvent.click(screen.getByTestId('view-logs'));
    expect(screen.getByTestId('test-logs')).toBeInTheDocument();
    expect(screen.getByText('starting')).toBeInTheDocument();
  });

  it('reveals a truncated object cell in full via a popover (Table view)', async () => {
    test.mockResolvedValue({
      rows: [{ id: 1, totals: { btc: 123.456, eth: 78.9 } }],
      logs: [],
      error: null,
    });
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });

    // the object cell is truncated in the row; clicking it opens the full pretty JSON
    const cell = await screen.findByTestId('json-cell');
    fireEvent.click(cell);
    expect(await screen.findByText(/"btc": 123\.456/)).toBeInTheDocument();
  });

  it('shows the backend error the run reported instead of a results table', async () => {
    test.mockResolvedValue({
      rows: [],
      logs: ['HTTP 401'],
      error: 'Authentication failed',
    });
    await runTestOnOneNode();

    expect(await screen.findByTestId('test-error')).toHaveTextContent('Authentication failed');
    expect(screen.queryByTestId('test-results')).toBeNull();
    expect(screen.queryByTestId('test-empty')).toBeNull();
  });

  it('shows a rejected request as an error rather than an empty result', async () => {
    test.mockRejectedValue(new Error('Network request failed'));
    await runTestOnOneNode();

    expect(await screen.findByTestId('test-error')).toHaveTextContent('Network request failed');
    expect(screen.queryByTestId('test-results')).toBeNull();
    expect(screen.queryByTestId('test-empty')).toBeNull();
  });

  it('says no rows were returned when the run succeeded with nothing in it', async () => {
    test.mockResolvedValue({ rows: [], logs: [], error: null });
    await runTestOnOneNode();

    expect(await screen.findByTestId('test-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('test-error')).toBeNull();
    expect(screen.queryByTestId('test-results')).toBeNull();
  });

  it('falls back to the raw sample when nothing cast, and says so', async () => {
    // The most diagnostic signal an author gets: records came back, but recordSelector /
    // fields did not turn them into rows.
    test.mockResolvedValue({ rows: [], sample: [{ id: 1 }], logs: [], error: null });
    await runTestOnOneNode();

    const table = await screen.findByTestId('test-results');
    expect(within(table).getByText('id')).toBeInTheDocument();
    expect(within(table).getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/raw sample/)).toBeInTheDocument();
    expect(screen.queryByTestId('test-empty')).toBeNull();
  });
});

describe('test settings persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  /** A connector with one SECRET parameter, one ordinary one, and a node to test. */
  function buildConnector() {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByText('Parameters'));
    addParameter('Token');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Token secret' }));
    addParameter('Region');

    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
  }

  /** Saves the draft so the connector gets an id, which is what it is persisted under. */
  async function saveDraft() {
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(getById).toHaveBeenCalledWith('def-1');
    });
  }

  it('never writes a SECRET parameter value to this device', async () => {
    buildConnector();
    await saveDraft();

    fireEvent.click(screen.getByTestId('test-settings-gear'));
    fireEvent.change(await screen.findByTestId('test-param-Token'), {
      target: { value: 'super-secret' },
    });
    fireEvent.change(screen.getByTestId('test-param-Region'), { target: { value: 'eu' } });

    const persisted = localStorage.getItem('connector-builder:test-settings:def-1');
    expect(persisted).not.toContain('super-secret');
    expect(persisted).not.toContain('Token');
    // ...while the ordinary parameter is still remembered.
    expect(persisted).toContain('eu');
  });

  it('drops a SECRET value that an earlier build already stored', async () => {
    localStorage.setItem(
      'connector-builder:test-settings:def-1',
      JSON.stringify({ values: { Token: 'leaked', Region: 'eu' }, maxRows: 25 })
    );
    buildConnector();
    await saveDraft();

    fireEvent.click(screen.getByTestId('test-settings-gear'));
    expect(await screen.findByTestId('test-param-Token')).toHaveValue('');
    expect(screen.getByTestId('test-param-Region')).toHaveValue('eu');
  });

  it('writes nothing for a connector that has not been saved yet', () => {
    buildConnector();

    fireEvent.click(screen.getByTestId('test-settings-gear'));
    fireEvent.change(screen.getByTestId('test-param-Region'), { target: { value: 'eu' } });

    // The old shared "new" bucket meant one draft's values surfaced in the next one.
    expect(localStorage.getItem('connector-builder:test-settings:new')).toBeNull();
    expect(testSettingsKeys()).toEqual([]);
  });

  it('purges the shared unsaved bucket an earlier build left behind', () => {
    localStorage.setItem(
      'connector-builder:test-settings:new',
      JSON.stringify({ values: { Token: 'leaked' }, maxRows: 25 })
    );
    render(<ConnectorBuilderPage />);

    expect(localStorage.getItem('connector-builder:test-settings:new')).toBeNull();
  });
});
