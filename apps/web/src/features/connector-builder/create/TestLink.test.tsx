import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { testPrefillFrom, testResultForChat } from '../shared/model/testLink';

const getById = vi.fn();
const getVersion = vi.fn();
const test = vi.fn();
const fittingCredentials = vi.fn();
const credentialRequirement = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = vi.fn();
    getById = getById;
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = getVersion;
    test = test;
    fittingCredentials = fittingCredentials;
    credentialRequirement = credentialRequirement;
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const manifest = {
  name: 'MyApi',
  title: 'My API',
  version: '1.0',
  baseUrl: 'https://api.example.test',
  parameters: {
    Token: { requiredType: 'string', attributes: ['SECRET'] },
    Region: { requiredType: 'string' },
  },
  nodes: {
    orders: { request: { path: '/orders' }, recordSelector: { path: [] } },
    items: { request: { path: '/items' }, recordSelector: { path: [] } },
  },
};

describe('a test link from an AI assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 2, status: 'draft', publishedAt: null }],
    });
    getVersion.mockResolvedValue({ version: 2, status: 'draft', manifest });
    test.mockResolvedValue({
      rows: [{ id: 1 }],
      logs: ['GET /items 200', 'token typed-secret-value echoed'],
      error: null,
      sample: [],
    });
    fittingCredentials.mockResolvedValue([{ id: 'cred-1' }]);
    credentialRequirement.mockResolvedValue({
      hosts: ['api.example.test'],
      fieldList: [],
      keyParameters: ['Token'],
    });
  });

  async function waitForLoadedNode(node: string) {
    await waitFor(() => {
      expect(screen.getByLabelText('Node to test')).toHaveTextContent(node);
    });
  }

  it('runs only the values in the link, not the ones saved on this device', async () => {
    localStorage.setItem(
      'connector-builder:test-settings:def-1',
      JSON.stringify({ values: { Region: 'us', Limit: '7' }, maxRows: 5 })
    );
    render(
      <ConnectorBuilderPage id='def-1' testPrefill={{ node: 'items', values: { Region: 'eu' } }} />
    );
    await waitForLoadedNode('items');
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(test).toHaveBeenCalledWith(
        expect.objectContaining({ configuration: { Region: 'eu' }, maxRows: 25 })
      );
    });
  });

  it('runs with the Credential from the link, without its key parameters', async () => {
    render(
      <ConnectorBuilderPage
        id='def-1'
        testPrefill={{
          node: 'items',
          values: { Region: 'eu', Token: 'typed' },
          credentialId: 'cred-1',
        }}
      />
    );
    await waitForLoadedNode('items');
    await waitFor(() => {
      expect(screen.getByTestId('run-test')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(test).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'cred-1', configuration: { Region: 'eu' } })
      );
    });
  });

  it('says so when the draft no longer has the node of the link', async () => {
    render(<ConnectorBuilderPage id='def-1' testPrefill={{ node: 'gone', values: {} }} />);

    expect(await screen.findByText('The draft has no gone node')).toBeInTheDocument();
    expect(screen.getByLabelText('Node to test')).not.toHaveTextContent('gone');
  });

  it('opens the test filled in, runs it with one click, and copies the result for the chat', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <ConnectorBuilderPage
        id='def-1'
        testPrefill={{ node: 'items', values: { Region: 'eu' }, maxRows: 10 }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Node to test')).toHaveTextContent('items');
    });
    fireEvent.click(screen.getByTestId('test-settings-gear'));
    fireEvent.change(await screen.findByTestId('test-param-Token'), {
      target: { value: 'typed-secret-value' },
    });
    const steps = screen.getByTestId('ai-test-steps');
    expect(steps).toHaveTextContent('Your AI assistant prepared a test of the items node');
    expect(within(steps).queryAllByLabelText('Done')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(test).toHaveBeenCalledWith(
        expect.objectContaining({
          node: 'items',
          configuration: { Region: 'eu', Token: 'typed-secret-value' },
          maxRows: 10,
        })
      );
    });
    // The copy names the node that ran, even after the user looks at another one.
    fireEvent.click((await screen.findAllByText('orders'))[0]);
    await waitForLoadedNode('orders');
    fireEvent.click(await screen.findByTestId('copy-for-ai-chat'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copied = String(writeText.mock.calls[0]?.[0]);
    expect(copied).toContain('Connector: MyApi (def-1), version 2');
    expect(copied).toContain('Node: items');
    expect(copied).toContain('"GET /items 200"');
    expect(copied).not.toContain('typed-secret-value');
    expect(copied).toContain('[REDACTED]');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(within(steps).getAllByLabelText('Done')).toHaveLength(2);
  });
});

describe('testPrefillFrom', () => {
  it('reads the node, values, Credential and row limit', () => {
    expect(
      testPrefillFrom(
        new URLSearchParams({
          test: 'items',
          credential: 'cred-1',
          rows: '10',
          config: JSON.stringify({ Region: 'eu', Limit: 5, Tags: ['a'] }),
        })
      )
    ).toEqual({
      node: 'items',
      values: { Region: 'eu', Limit: '5', Tags: '["a"]' },
      credentialId: 'cred-1',
      maxRows: 10,
    });
  });

  it('keeps the row limit inside what the test accepts', () => {
    expect(testPrefillFrom(new URLSearchParams({ test: 'items', rows: '5000' }))?.maxRows).toBe(
      1000
    );
  });

  it('ignores a link without a node and a broken configuration', () => {
    expect(testPrefillFrom(new URLSearchParams({ config: '{}' }))).toBeUndefined();
    expect(testPrefillFrom(new URLSearchParams({ test: 'items', config: '{"Reg' }))).toEqual({
      node: 'items',
      values: {},
    });
  });
});

describe('testResultForChat', () => {
  const base = {
    connectorId: 'def-1',
    connectorName: 'MyApi',
    version: 2,
    unsavedEdits: false,
    node: 'items',
    secrets: [] as string[],
  };

  it('masks typed key values, also inside escaped JSON', () => {
    const text = testResultForChat({
      ...base,
      secrets: ['abc"def', 'xy'],
      result: { rows: [{ key: 'abc"def' }], logs: ['sent abc"def'], error: null, sample: [] },
    });
    expect(text).not.toContain('abc');
    expect(text).toContain('[REDACTED]');
  });

  it('masks a longer key before a shorter one that starts it', () => {
    const text = testResultForChat({
      ...base,
      secrets: ['abcd', 'abcdef'],
      result: { rows: [], logs: ['sent abcdef and abcd'], error: null, sample: [] },
    });
    expect(text).toContain('sent [REDACTED] and [REDACTED]');
  });

  it('bounds rows and logs and names an error', () => {
    const text = testResultForChat({
      ...base,
      unsavedEdits: true,
      result: {
        rows: Array.from({ length: 30 }, (_, id) => ({ id })),
        logs: Array.from({ length: 60 }, (_, line) => `line ${line} ${'x'.repeat(600)}`),
        error: 'HTTP 401',
        sample: [],
      },
    });
    expect(text).toContain('with unsaved edits');
    expect(text).toContain('Status: error');
    expect(text).toContain('"rowsNotShown": 5');
    expect(text).toContain('10 earlier log lines not shown');
    expect(text).toContain('… [cut]');
  });
});
