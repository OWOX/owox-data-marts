import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const runTest = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = vi.fn();
    getById = vi.fn();
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
    test = runTest;
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
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

/** Renames the node in Code mode by editing its key in the JSON. */
function renameInCode(from: string, to: string) {
  const editor = screen.getByTestId('monaco');
  const manifest = JSON.parse((editor as HTMLTextAreaElement).value) as {
    nodes: Record<string, unknown>;
  };
  manifest.nodes = Object.fromEntries(
    Object.entries(manifest.nodes).map(([name, node]) => [name === from ? to : name, node])
  );
  fireEvent.change(editor, { target: { value: JSON.stringify(manifest, null, 2) } });
}

function sentNode(call = 0) {
  const request = runTest.mock.calls[call][0] as {
    node: string;
    manifest: { nodes: Record<string, unknown> };
  };
  return { node: request.node, nodes: Object.keys(request.manifest.nodes) };
}

// A node renamed in Code mode used to be tested under its old name, which the manifest no
// longer has: the run was refused with "Unknown node" although the rename was fine.
describe('Test after renaming a node in Code mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTest.mockResolvedValue({ rows: [], logs: [], error: null, sample: [] });
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    fireEvent.click(screen.getByTestId('mode-code'));
  });

  it('tests the renamed node when Test is pressed straight after typing', async () => {
    renameInCode('items', 'orders');
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(runTest).toHaveBeenCalledTimes(1);
    });
    expect(sentNode()).toEqual({ node: 'orders', nodes: ['orders'] });
  });

  it('tests the renamed node once the edit has reached the builder', async () => {
    renameInCode('items', 'orders');
    await new Promise(resolve => setTimeout(resolve, 400));
    fireEvent.click(screen.getByTestId('run-test'));

    await waitFor(() => {
      expect(runTest).toHaveBeenCalledTimes(1);
    });
    expect(sentNode()).toEqual({ node: 'orders', nodes: ['orders'] });
  });
});
