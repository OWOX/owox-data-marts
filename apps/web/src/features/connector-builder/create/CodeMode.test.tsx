import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

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
const getById = vi.fn();
vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = vi.fn();
    getById = getById;
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
    test = vi.fn();
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('Builder ↔ Code toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('round-trips a node added via the JSON editor into the builder', () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByTestId('mode-code'));
    const ta = screen.getByTestId<HTMLTextAreaElement>('monaco');
    expect(ta.value).toContain('"name": "MyApi"');

    const edited = JSON.stringify({
      version: '1.0',
      name: 'MyApi',
      baseUrl: '',
      parameters: {},
      nodes: {
        users: {
          request: { method: 'GET', path: '' },
          recordSelector: { recordPath: [] },
          fields: {},
        },
      },
    });
    fireEvent.change(ta, { target: { value: edited } });

    // Straight to the Builder tab, with no idle time for the debounce: unmounting the
    // editor must not cost the author the edit.
    fireEvent.click(screen.getByTestId('mode-builder'));
    expect(screen.getByRole('button', { name: 'users' })).toBeInTheDocument();
  });

  it('shows an inline error on invalid JSON and keeps the builder usable', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: '{ not valid' } });
    expect(screen.getByTestId('code-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mode-builder'));
    fireEvent.click(await screen.findByRole('button', { name: /discard & switch/i }));
    expect(screen.getByPlaceholderText('MyCustomApi')).toBeInTheDocument();
  });

  it('will not save or publish a buffer that does not parse', () => {
    render(<ConnectorBuilderPage />);
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: '{ not valid' } });

    // Publishing here would ship the last manifest that parsed — everything typed since
    // is not in it — and say "Published".
    expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();
  });

  it('asks before dropping an unparseable buffer on the way to the Builder tab', async () => {
    render(<ConnectorBuilderPage />);
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: '{ half typed' } });

    fireEvent.click(screen.getByTestId('mode-builder'));
    // Cancelling leaves the author where they were, with the text still there to fix.
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    await waitFor(() => {
      expect(screen.getByTestId<HTMLTextAreaElement>('monaco').value).toBe('{ half typed');
    });
    expect(screen.queryByPlaceholderText('MyCustomApi')).toBeNull();

    // Confirming drops it, and the builder is savable again.
    fireEvent.click(screen.getByTestId('mode-builder'));
    fireEvent.click(await screen.findByRole('button', { name: /discard & switch/i }));
    expect(screen.getByPlaceholderText('MyCustomApi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeEnabled();
  });
});
