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

describe('Field description + node overview', () => {
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

  it('authors a field description', async () => {
    addNode();
    addField('id');
    fireEvent.change(screen.getByTestId('fielddesc-id'), { target: { value: 'The record id' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.fields.id.description).toBe(
      'The record id'
    );
  });

  it('authors a node overview', async () => {
    addNode();
    fireEvent.change(screen.getByPlaceholderText(/shown when picking/i), {
      target: { value: 'All items' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.overview).toBe('All items');
  });
});
