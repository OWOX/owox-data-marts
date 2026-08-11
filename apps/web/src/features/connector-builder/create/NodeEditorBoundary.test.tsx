import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

// Node names whose section list throws on render. The point of the boundary is that *any*
// unguarded read in the node pane degrades to a message, so the honest stimulus is a child
// that throws — the same thing a field the declared types promise but the manifest omits
// does. `vi.hoisted` is needed because `vi.mock` factories run before module-level consts.
const { failing } = vi.hoisted(() => ({ failing: new Set<string>() }));

vi.mock('./components/node/NodeSections', () => ({
  NodeSections: ({ nodeName }: { nodeName: string }) => {
    if (failing.has(nodeName)) throw new Error(`node "${nodeName}" cannot be rendered`);
    return <div data-testid='node-sections' />;
  },
}));

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = vi.fn();
    getById = vi.fn();
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
    softDelete = vi.fn();
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value }: { value: string }) => (
    <textarea data-testid='monaco' value={value} readOnly />
  ),
}));

/** Adds a node through the nav rail and selects it, which is what mounts the node pane. */
function addNode(name: string) {
  fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add node' }));
}

/** The nav rail row for `name` (the pane header carries the same text when it renders). */
function navRailRow(name: string): HTMLElement {
  return within(screen.getByTestId('builder-nav-rail')).getByRole('button', { name });
}

describe('node editor error boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    failing.clear();
    failing.add('broken');
  });

  it('shows an actionable message instead of a blank pane when the node pane throws', () => {
    render(<ConnectorBuilderPage />);
    addNode('broken');

    expect(screen.getByTestId('node-editor-error')).toBeInTheDocument();
    expect(screen.getByText("This node can't be shown in the form")).toBeInTheDocument();
    // The message has to name the way out, not just say something went wrong.
    expect(screen.getByTestId('node-editor-error')).toHaveTextContent(
      /switch to\s*Code\s*at the top of the left column/i
    );
  });

  it('leaves the surrounding chrome mounted and Code mode reachable', () => {
    render(<ConnectorBuilderPage />);
    addNode('broken');

    expect(screen.getByTestId('node-editor-error')).toBeInTheDocument();
    expect(screen.getByTestId('builder-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('builder-nav-rail')).toBeInTheDocument();
    expect(screen.getByTestId('mode-code')).toBeInTheDocument();

    // Code mode is how the author repairs the JSON that broke the form, so it must work.
    fireEvent.click(screen.getByTestId('mode-code'));
    expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('node-editor-error')).not.toBeInTheDocument();
  });

  it('renders a healthy node again once another node is selected', () => {
    render(<ConnectorBuilderPage />);
    addNode('broken');
    expect(screen.getByTestId('node-editor-error')).toBeInTheDocument();

    addNode('healthy');
    expect(screen.queryByTestId('node-editor-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-sections')).toBeInTheDocument();

    // ...and going back to the broken one still contains the crash.
    fireEvent.click(navRailRow('broken'));
    expect(screen.getByTestId('node-editor-error')).toBeInTheDocument();
    expect(screen.getByTestId('builder-topbar')).toBeInTheDocument();
  });

  it('recovers on "Try again" without a page reload once the node renders', () => {
    render(<ConnectorBuilderPage />);
    addNode('broken');
    expect(screen.getByTestId('node-editor-error')).toBeInTheDocument();

    failing.delete('broken');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByTestId('node-editor-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-sections')).toBeInTheDocument();
  });

  it('does not stand between the author and a node that renders fine', () => {
    render(<ConnectorBuilderPage />);
    addNode('healthy');

    expect(screen.getByTestId('node-sections')).toBeInTheDocument();
    expect(screen.queryByTestId('node-editor-error')).not.toBeInTheDocument();
  });
});
