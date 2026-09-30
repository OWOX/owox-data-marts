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
// Dynamic import inside the factory: `vi.mock` is hoisted above every import.
vi.mock('@owox/ui/components/select', async () =>
  (await import('./select-test-mock')).selectAsNativeElement()
);
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

function addNode(name: string) {
  fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /add node/i }));
}

/** Renames a node in Code mode by editing its key in the JSON, where it keeps its position. */
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

/** Longer than Code mode's debounce, so the edit has reached the builder. */
const afterDebounce = () => new Promise(resolve => setTimeout(resolve, 400));

async function runAndGetNode(): Promise<string> {
  const before = runTest.mock.calls.length;
  fireEvent.click(screen.getByTestId('run-test'));
  await waitFor(() => {
    expect(runTest).toHaveBeenCalledTimes(before + 1);
  });
  const request = runTest.mock.calls[before][0] as {
    node: string;
    manifest: { nodes: Record<string, unknown> };
  };
  expect(Object.keys(request.manifest.nodes)).toContain(request.node);
  return request.node;
}

// A node renamed in Code mode used to be tested under its old name, which the manifest no
// longer has: the run was refused with "Unknown node" although the rename was fine.
describe('Test after renaming a node in Code mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTest.mockResolvedValue({ rows: [], logs: [], error: null, sample: [] });
    render(<ConnectorBuilderPage />);
    addNode('items');
  });

  it('tests the renamed node when Test is pressed straight after typing', async () => {
    fireEvent.click(screen.getByTestId('mode-code'));
    renameInCode('items', 'orders');

    expect(await runAndGetNode()).toBe('orders');
  });

  it('tests the renamed node once the edit has reached the builder', async () => {
    fireEvent.click(screen.getByTestId('mode-code'));
    renameInCode('items', 'orders');
    await afterDebounce();

    expect(await runAndGetNode()).toBe('orders');
  });

  // With one node every fallback lands on it; a second node shows the dock follows the
  // renamed node by its position.
  it('follows a renamed node that is not the first one', async () => {
    addNode('orders');
    fireEvent.click(screen.getByTestId('mode-code'));
    renameInCode('orders', 'sales');
    expect(await runAndGetNode()).toBe('sales');

    await afterDebounce();
    expect(await runAndGetNode()).toBe('sales');
  });

  // Code mode hides the nav rail, so the dock's own pick is the only choice the author has
  // there; a rename must not put the nav-rail node back in its place.
  it('keeps the node picked in the dock when another edit renames it', async () => {
    addNode('orders');
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Node to test' }), {
      target: { value: 'items' },
    });
    renameInCode('items', 'sales');
    expect(await runAndGetNode()).toBe('sales');

    await afterDebounce();
    expect(await runAndGetNode()).toBe('sales');
  });
});
