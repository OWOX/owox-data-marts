import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const create = vi.fn();
const getById = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
    softDelete = vi.fn();
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

/** Two nodes that both carry cursor pagination, so the pane's cursor subtree stays
 * mounted across a node switch — the case where anything uncontrolled carries over. */
const TWO_NODES = JSON.stringify({
  version: '1.0',
  name: 'MyApi',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {
    alpha: {
      request: { method: 'GET', path: '/alpha' },
      recordSelector: { recordPath: [] },
      fields: {},
      pagination: {
        type: 'cursor',
        cursorPath: ['alpha', 'next'],
        cursorParam: 'after',
        stopCondition: { path: ['alpha', 'done'], equals: true },
      },
    },
    beta: {
      request: { method: 'GET', path: '/beta' },
      recordSelector: { recordPath: [] },
      fields: {},
      pagination: { type: 'cursor', cursorPath: ['beta', 'next'], cursorParam: 'after' },
    },
  },
});

/** Load the two-node manifest through Code mode — the path an AI-authored or pasted
 * manifest actually takes — then return to the form. */
function loadTwoNodes() {
  render(<ConnectorBuilderPage />);
  fireEvent.click(screen.getByTestId('mode-code'));
  fireEvent.change(screen.getByTestId('monaco'), { target: { value: TWO_NODES } });
  fireEvent.click(screen.getByTestId('mode-builder'));
}

function selectNode(name: string) {
  fireEvent.click(within(screen.getByTestId('builder-nav-rail')).getByRole('button', { name }));
}

describe('switching between nodes', () => {
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

  it('shows the selected node values, not the previously selected node ones', () => {
    loadTwoNodes();

    selectNode('alpha');
    expect(screen.getByPlaceholderText('paging.next')).toHaveValue('alpha.next');
    expect(screen.getByPlaceholderText('pageInfo.hasNextPage')).toHaveValue('alpha.done');

    selectNode('beta');
    expect(screen.getByPlaceholderText('paging.next')).toHaveValue('beta.next');
    expect(screen.getByPlaceholderText('pageInfo.hasNextPage')).toHaveValue('');
  });

  it('does not write the previous node stop-condition path into the selected node', async () => {
    loadTwoNodes();

    selectNode('alpha');
    selectNode('beta');
    // beta declares no stop condition. Filling in only "equals" leaves it incomplete,
    // so nothing should be written — least of all alpha's path.
    fireEvent.change(screen.getByPlaceholderText('false'), { target: { value: 'false' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const nodes = create.mock.calls[0][0].manifest.nodes;
    expect(nodes.beta.pagination.stopCondition).toBeUndefined();
    // ...and alpha is untouched by the visit to beta.
    expect(nodes.alpha.pagination.stopCondition).toEqual({
      path: ['alpha', 'done'],
      equals: true,
    });
  });
});
