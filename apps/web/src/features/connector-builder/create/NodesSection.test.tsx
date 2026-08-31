import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addField } from './parameters-test-helpers';

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

describe('Builder Nodes flow', () => {
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

  it('adds a node with a GET request and a field, and the saved manifest reflects it', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // Request section is open by default — set the path
    fireEvent.change(screen.getByPlaceholderText('/v1/items'), { target: { value: '/v1/items' } });

    // switch to Fields accordion section
    addField('id');
    expect(screen.getByTestId('field-id')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.items).toBeDefined();
    expect(manifest.nodes.items.request.method).toBe('GET');
    expect(manifest.nodes.items.request.path).toBe('/v1/items');
    expect(manifest.nodes.items.fields.id).toEqual({ type: 'string' });
  });

  it('adds an "add" transformation to a node and the saved manifest reflects it', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    fireEvent.click(screen.getByRole('button', { name: /add transformation/i }));
    expect(screen.getByTestId('transform-0')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('field name'), { target: { value: 'label' } });
    fireEvent.change(screen.getByPlaceholderText('{{ record.x }} or constant'), {
      target: { value: 'item-{{ record.id }}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.items.transformations).toEqual([
      { type: 'add', field: 'label', value: 'item-{{ record.id }}' },
    ]);
  });

  it('renames a node by editing its title and rekeys the manifest', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // Click the node title in the editor header → inline rename input.
    fireEvent.click(screen.getByTestId('node-rename'));
    const input = screen.getByTestId('node-rename-input');
    fireEvent.change(input, { target: { value: 'orders' } });
    fireEvent.blur(input);

    expect(screen.getByTestId('node-editor-orders')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.orders).toBeDefined();
    expect(manifest.nodes.items).toBeUndefined();
  });

  it('adds an error-handler filter to a node and the saved manifest reflects it', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
    expect(screen.getByTestId('error-filter-0')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('429, 503'), { target: { value: '404' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.items.errorHandler.responseFilters).toEqual([
      { httpCodes: [404], action: 'RETRY' },
    ]);
  });

  it('authors message/body match and an exponential default backoff', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // open the Error handling section (same label the existing error-handler test uses)
    fireEvent.click(screen.getByRole('button', { name: /add filter/i }));

    fireEvent.change(
      screen.getByTestId('error-filter-0').querySelector('input[placeholder="429, 503"]')!,
      { target: { value: '400' } }
    );
    fireEvent.change(screen.getByPlaceholderText('message contains'), {
      target: { value: 'No changes' },
    });
    fireEvent.change(screen.getByPlaceholderText('body path e.g. error.type'), {
      target: { value: 'error.type' },
    });
    fireEvent.change(screen.getByPlaceholderText('equals'), { target: { value: 'INVALID' } });

    // default backoff: exponential
    fireEvent.change(screen.getByLabelText('Default backoff'), {
      target: { value: 'exponential' },
    });
    fireEvent.change(screen.getByLabelText('Default backoff factor'), { target: { value: '3' } });

    // save and assert the manifest (reuse the existing test's save+capture pattern)
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalled();
    });
    const manifest = create.mock.calls[0][0].manifest;
    const eh = manifest.nodes.items.errorHandler;
    expect(eh.responseFilters[0]).toMatchObject({
      httpCodes: [400],
      messageContains: 'No changes',
      bodyMatch: { path: ['error', 'type'], equals: 'INVALID' },
    });
    expect(eh.backoff).toMatchObject({ type: 'exponential', factor: 3 });
  });

  it('keeps each error-filter row showing its own codes after a middle filter is deleted', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
    fireEvent.click(screen.getByRole('button', { name: /add filter/i }));

    const codeInputs = screen.getAllByPlaceholderText('429, 503');
    fireEvent.change(codeInputs[0], { target: { value: '404' } });
    fireEvent.change(codeInputs[1], { target: { value: '500' } });

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }));

    const remaining = screen.getAllByPlaceholderText('429, 503');
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as HTMLInputElement).value).toBe('500');
  });

  it('sets a CSV response format on a node and the saved manifest reflects it', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // Response format lives in the Request block (always mounted — no section to open).
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.items.recordSelector.responseFormat).toBe('csv');
  });

  it('configures a substream partitionRouter on a node, saved in the manifest', async () => {
    render(<ConnectorBuilderPage />);

    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    fireEvent.click(screen.getByRole('checkbox', { name: /enable partitioning/i }));
    fireEvent.change(screen.getByPlaceholderText('/campaigns'), {
      target: { value: '/campaigns' },
    });
    fireEvent.change(screen.getByPlaceholderText('data'), { target: { value: 'data' } });
    fireEvent.change(screen.getByPlaceholderText('id'), { target: { value: 'id' } });
    fireEvent.change(screen.getByPlaceholderText('campaign_id'), {
      target: { value: 'campaign_id' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const pr = create.mock.calls[0][0].manifest.nodes.items.partitionRouter;
    expect(pr.type).toBe('substream');
    expect(pr.parent.request.path).toBe('/campaigns');
    expect(pr.parent.key).toBe('id');
    expect(pr.partitionField).toBe('campaign_id');
    expect(pr.parent.recordPath).toEqual(['data']);
  });

  it('authors a list partition router', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /enable partitioning/i }));
    fireEvent.change(screen.getByLabelText('Partition source'), { target: { value: 'list' } });
    fireEvent.change(screen.getByPlaceholderText('US, UK, DE'), { target: { value: 'US, UK' } });
    fireEvent.change(screen.getByPlaceholderText('country'), { target: { value: 'country' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.items.partitionRouter).toMatchObject({
      type: 'list',
      values: ['US', 'UK'],
      partitionField: 'country',
    });
  });

  it('authors a record filter', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /enable record filter/i }));
    fireEvent.change(screen.getByPlaceholderText('sheetType'), { target: { value: 'sheetType' } });
    fireEvent.change(screen.getByLabelText('Filter operator'), { target: { value: 'equals' } });
    fireEvent.change(screen.getByPlaceholderText('GRID'), { target: { value: 'GRID' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const manifest = create.mock.calls[0][0].manifest;
    expect(manifest.nodes.items.recordFilter).toMatchObject({
      path: ['sheetType'],
      operator: 'equals',
      value: 'GRID',
    });
  });
});
