import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

// Dynamic import inside the factory: `vi.mock` is hoisted above every import, so a
// top-level binding is not initialised yet when the factory runs.
vi.mock('@owox/ui/components/select', async () =>
  (await import('./select-test-mock')).selectAsNativeElement()
);

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

function addNode() {
  render(<ConnectorBuilderPage />);
  fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
  fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
  fireEvent.click(screen.getByRole('button', { name: /add node/i }));
}

describe('Builder Pagination flow', () => {
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

  it('configures offset pagination on a node', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Offset' }));
    fireEvent.change(screen.getByPlaceholderText('offset'), { target: { value: 'skip' } });
    fireEvent.change(within(screen.getByTestId('node-editor-items')).getByRole('spinbutton'), {
      target: { value: '50' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.pagination).toEqual({
      type: 'offset',
      offsetParam: 'skip',
      pageSize: 50,
    });
  });

  it('configures cursor pagination on a node', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));
    fireEvent.change(screen.getByPlaceholderText('paging.next'), {
      target: { value: 'meta.next_cursor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.pagination).toEqual({
      type: 'cursor',
      cursorPath: ['meta', 'next_cursor'],
      cursorParam: 'cursor',
    });
  });

  it('configures cursor inject target, header source, and stop condition', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));
    fireEvent.change(screen.getByLabelText('Cursor inject target'), { target: { value: 'body' } });
    fireEvent.change(screen.getByPlaceholderText('variables.after'), {
      target: { value: 'variables.after' },
    });
    fireEvent.change(screen.getByLabelText('Cursor source'), { target: { value: 'body' } });
    fireEvent.change(screen.getByPlaceholderText('data.pageInfo.endCursor'), {
      target: { value: 'data.pageInfo.endCursor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.pagination).toMatchObject({
      type: 'cursor',
      cursor: { from: 'body', path: ['data', 'pageInfo', 'endCursor'] },
      inject: { into: 'body', path: ['variables', 'after'] },
    });
  });

  it('authors an offset inject target (header)', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Offset' }));
    fireEvent.change(screen.getByLabelText('Offset inject target'), {
      target: { value: 'header' },
    });
    fireEvent.change(screen.getByLabelText('Offset inject name'), {
      target: { value: 'X-Offset' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.pagination).toMatchObject({
      type: 'offset',
      inject: { into: 'header', name: 'X-Offset' },
    });
  });

  it('saves stopCondition atomically with equals:false as boolean', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));
    // fill path first so state has it when equals fires
    fireEvent.change(screen.getByPlaceholderText('pageInfo.hasNextPage'), {
      target: { value: 'pageInfo.hasNextPage' },
    });
    // now fill equals — both present, stopCondition should be written atomically
    fireEvent.change(screen.getByPlaceholderText('false'), { target: { value: 'false' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.pagination).toMatchObject({
      type: 'cursor',
      stopCondition: { path: ['pageInfo', 'hasNextPage'], equals: false },
    });
  });
});

describe('Builder Incremental flow', () => {
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

  it('configures range incremental injected into query', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
    fireEvent.change(screen.getByPlaceholderText('start_date'), { target: { value: 'from' } });
    fireEvent.change(screen.getByPlaceholderText('end_date'), { target: { value: 'to' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const inc = create.mock.calls[0][0].manifest.nodes.items.incremental;
    expect(inc.strategy).toBe('range');
    // No `cursorField`: the engine never reads one, so the builder does not author one.
    expect(inc).not.toHaveProperty('cursorField');
    expect(screen.queryByText('Cursor field')).toBeNull();
    expect(inc.request).toEqual({
      into: 'query',
      startName: 'from',
      endName: 'to',
      format: 'YYYY-MM-DD',
    });
  });

  it('configures range incremental injected into body JSON paths', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
    fireEvent.click(
      within(screen.getByTestId('node-editor-items')).getByRole('button', { name: 'body' })
    );
    fireEvent.change(screen.getByPlaceholderText('date.start'), {
      target: { value: 'date_range.start' },
    });
    fireEvent.change(screen.getByPlaceholderText('date.end'), {
      target: { value: 'date_range.end' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const inc = create.mock.calls[0][0].manifest.nodes.items.incremental;
    expect(inc.request.into).toBe('body');
    expect(inc.request.startPath).toEqual(['date_range', 'start']);
    expect(inc.request.endPath).toEqual(['date_range', 'end']);
  });

  it('selecting an incremental strategy does not change isTimeSeries', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const node = create.mock.calls[0][0].manifest.nodes.items;
    expect(node.incremental.strategy).toBe('day-by-day');
    expect(node.isTimeSeries).toBeUndefined();
  });

  it('shows an End parameter input for day-by-day and writes endName into the request', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));
    fireEvent.change(screen.getByPlaceholderText('end_date'), { target: { value: 'end' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const inc = create.mock.calls[0][0].manifest.nodes.items.incremental;
    expect(inc.strategy).toBe('day-by-day');
    expect(inc.request.endName).toBe('end');
  });

  it('shows an End path input for day-by-day injected into body and writes endPath', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));
    fireEvent.click(
      within(screen.getByTestId('node-editor-items')).getByRole('button', { name: 'body' })
    );
    fireEvent.change(screen.getByPlaceholderText('date.end'), {
      target: { value: 'date_range.end' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const inc = create.mock.calls[0][0].manifest.nodes.items.incremental;
    expect(inc.request.into).toBe('body');
    expect(inc.request.endPath).toEqual(['date_range', 'end']);
  });

  it('preserves startName/endName for day-by-day when toggling Inject into query -> body -> query', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));
    fireEvent.change(screen.getByPlaceholderText('start_date'), { target: { value: 'from' } });
    fireEvent.change(screen.getByPlaceholderText('end_date'), { target: { value: 'end' } });

    const nodeEditor = screen.getByTestId('node-editor-items');
    fireEvent.click(within(nodeEditor).getByRole('button', { name: 'body' }));
    fireEvent.click(within(nodeEditor).getByRole('button', { name: 'query' }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const inc = create.mock.calls[0][0].manifest.nodes.items.incremental;
    expect(inc.request.into).toBe('query');
    expect(inc.request.startName).toBe('from');
    expect(inc.request.endName).toBe('end');
  });

  it('preserves startName/endName when switching strategy day-by-day <-> range', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));
    fireEvent.change(screen.getByPlaceholderText('start_date'), { target: { value: 'from' } });
    fireEvent.change(screen.getByPlaceholderText('end_date'), { target: { value: 'end' } });

    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
    fireEvent.click(screen.getByRole('button', { name: 'Day-by-day' }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const inc = create.mock.calls[0][0].manifest.nodes.items.incremental;
    expect(inc.strategy).toBe('day-by-day');
    expect(inc.request.startName).toBe('from');
    expect(inc.request.endName).toBe('end');
  });

  it('authors substream parent query parameters', async () => {
    addNode();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable partitioning' }));
    fireEvent.change(screen.getByPlaceholderText('Parent param key'), {
      target: { value: 'limit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add parent query parameter' }));
    const prEditor = screen.getByTestId('partition-router-editor');
    fireEvent.change(within(prEditor).getByPlaceholderText('{{ parameters.X }}'), {
      target: { value: '100' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(
      create.mock.calls[0][0].manifest.nodes.items.partitionRouter.parent.request.queryParameters
    ).toEqual({ limit: '100' });
  });

  it('authors substream parent pagination', async () => {
    addNode();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable partitioning' }));

    const prEditor = screen.getByTestId('partition-router-editor');
    fireEvent.click(within(prEditor).getByRole('button', { name: 'Offset' }));
    fireEvent.change(within(prEditor).getByRole('spinbutton'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.partitionRouter.parent.pagination).toEqual({
      type: 'offset',
      offsetParam: 'offset',
      pageSize: 50,
    });
  });
});
