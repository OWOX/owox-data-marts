import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addField } from './parameters-test-helpers';

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

describe('Node field flags (primary key / default) + node general settings', () => {
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

  it('toggles a field as primary key and default via the checkbox columns', async () => {
    addNode();
    addField('id');

    fireEvent.click(screen.getByTestId('pk-id'));
    fireEvent.click(screen.getByTestId('default-id'));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const node = create.mock.calls[0][0].manifest.nodes.items;
    expect(node.uniqueKeys).toEqual(['id']);
    expect(node.defaultFields).toEqual(['id']);
  });

  it('unchecking primary key removes the field from uniqueKeys', async () => {
    addNode();
    addField('id');
    fireEvent.click(screen.getByTestId('pk-id')); // on
    fireEvent.click(screen.getByTestId('pk-id')); // off

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.uniqueKeys).toBeUndefined();
  });

  it('sets destination table name from the node General area (no Fields section needed)', async () => {
    addNode();
    // Destination table name now lives in the node's top General area, visible
    // without expanding the Fields section (placeholder defaults to the node name).
    fireEvent.change(screen.getByPlaceholderText('items'), { target: { value: 'my_items' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.destinationName).toBe('my_items');
  });
});
