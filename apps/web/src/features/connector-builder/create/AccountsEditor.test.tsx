import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

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

function renderPage() {
  render(<ConnectorBuilderPage />);
  fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
  // Accounts now lives on the Parameters tab (no longer under General).
  fireEvent.click(screen.getByText('Parameters'));
}

describe('Accounts editor', () => {
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

  it('renders the Accounts block on the Parameters tab (no separate nav item)', () => {
    renderPage();
    // Accounts is no longer a nav row — it lives inline on the Parameters tab.
    expect(screen.getByTestId('accounts-editor')).toBeInTheDocument();
  });

  it('authors a source-level accounts block (from + split) on save', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: /iterate over multiple accounts/i }));
    fireEvent.change(screen.getByPlaceholderText('{{ parameters.AccountIds }}'), {
      target: { value: '{{ parameters.AccountIds }}' },
    });
    fireEvent.change(screen.getByPlaceholderText('[,;]'), { target: { value: '\\|' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.accounts).toEqual({
      from: '{{ parameters.AccountIds }}',
      parse: { split: '\\|' },
    });
  });

  it('removes accounts when disabled', async () => {
    renderPage();
    const cb = screen.getByRole('checkbox', { name: /iterate over multiple accounts/i });
    fireEvent.click(cb); // enable
    fireEvent.change(screen.getByPlaceholderText('{{ parameters.AccountIds }}'), {
      target: { value: 'x' },
    });
    fireEvent.click(cb); // disable

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.accounts).toBeUndefined();
  });
});
