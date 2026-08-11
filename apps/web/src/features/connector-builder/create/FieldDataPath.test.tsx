import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';
import { addField } from './parameters-test-helpers';

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
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
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

describe('Field data path', () => {
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
    test.mockResolvedValue({
      rows: [{ id: 1 }],
      logs: [],
      error: null,
      sample: [{ id: 1, releaseDates: { Japan: 'x' } }],
    });
  });

  function addNodeWithField() {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'games' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    addField('Japan');
  }

  it('writes a field dataPath into the manifest', async () => {
    addNodeWithField();
    fireEvent.change(screen.getByTestId('datapath-Japan'), {
      target: { value: 'releaseDates.Japan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.games.fields.Japan.dataPath).toBe(
      'releaseDates.Japan'
    );
  });

  it('suggests paths from the last test sample in the datalist', async () => {
    addNodeWithField();
    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      const opts = Array.from(document.querySelectorAll('datalist option')).map(o =>
        o.getAttribute('value')
      );
      expect(opts).toContain('releaseDates.Japan');
      expect(opts).toContain('releaseDates');
      expect(opts).toContain('id');
    });
  });

  it('discovers fields from the test sample and preserves existing fields', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'games' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    // pre-add an `id` field as string — discovery must NOT overwrite it
    addField('id');

    // run a test → stores the sample [{ id: 1, releaseDates: { Japan: 'x' } }]
    fireEvent.click(screen.getByTestId('run-test'));
    await waitFor(() => {
      expect(test).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /discover fields from sample/i })
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /discover fields from sample/i }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const fields = create.mock.calls[0][0].manifest.nodes.games.fields;
    expect(fields.id).toEqual({ type: 'string' }); // pre-existing field preserved (not overwritten to integer)
    expect(fields.releaseDates).toEqual({ type: 'string' }); // object value → string, newly discovered
  });

  it('disables Discover fields when there is no sample', () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'games' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(screen.getByRole('button', { name: /discover fields from sample/i })).toBeDisabled();
  });
});
