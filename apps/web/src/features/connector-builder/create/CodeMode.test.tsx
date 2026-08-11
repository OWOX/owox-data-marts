import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    fireEvent.click(screen.getByTestId('mode-builder'));
    expect(screen.getByRole('button', { name: 'users' })).toBeInTheDocument();
  });

  it('shows an inline error on invalid JSON and keeps the builder usable', () => {
    render(<ConnectorBuilderPage />);
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: '{ not valid' } });
    expect(screen.getByTestId('code-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mode-builder'));
    expect(screen.getByPlaceholderText('MyCustomApi')).toBeInTheDocument();
  });
});
