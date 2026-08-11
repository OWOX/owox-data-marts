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
  // Advanced Parameters lives on the Parameters tab, directly before Accounts.
  fireEvent.click(screen.getByText('Parameters'));
}

describe('Advanced Parameters editor', () => {
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

  it('renders the ReimportLookbackWindow=2 / CreateEmptyTables=on fallback defaults when the manifest has neither param', () => {
    renderPage();
    expect(screen.getByLabelText('Reimport Lookback Window')).toHaveValue(2);
    expect(screen.getByRole('checkbox', { name: 'Create Empty Tables' })).toBeChecked();
  });

  it('editing Reimport Lookback Window to 5 writes parameters.ReimportLookbackWindow with default:5 and [ADVANCED]', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Reimport Lookback Window'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const param = create.mock.calls[0][0].manifest.parameters.ReimportLookbackWindow;
    expect(param.default).toBe(5);
    expect(param.attributes).toContain('ADVANCED');
  });

  // The engine walks the window one day at a time, so the value multiplies API requests.
  // A bare `max` on a number input does not stop the keystroke — the written value is what
  // has to be bounded.
  describe('the lookback window is bounded to whole days in [0, 180]', () => {
    async function savedLookback(typed: string) {
      renderPage();
      fireEvent.change(screen.getByLabelText('Reimport Lookback Window'), {
        target: { value: typed },
      });
      fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
      await waitFor(() => {
        expect(create).toHaveBeenCalledTimes(1);
      });
      return create.mock.calls[0][0].manifest.parameters.ReimportLookbackWindow.default;
    }

    it('clamps a value above the cap down to 180', async () => {
      expect(await savedLookback('5000')).toBe(180);
    });

    it('keeps the cap itself', async () => {
      expect(await savedLookback('180')).toBe(180);
    });

    it('clamps a negative value up to 0', async () => {
      expect(await savedLookback('-7')).toBe(0);
    });

    it('truncates a fractional day', async () => {
      expect(await savedLookback('2.9')).toBe(2);
    });

    it('marks the input with the cap so the browser reports it too', () => {
      renderPage();
      expect(screen.getByLabelText('Reimport Lookback Window')).toHaveAttribute('max', '180');
    });
  });

  it('toggling Create Empty Tables off writes parameters.CreateEmptyTables.default===false with [ADVANCED]', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create Empty Tables' }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    const param = create.mock.calls[0][0].manifest.parameters.CreateEmptyTables;
    expect(param.default).toBe(false);
    expect(param.attributes).toContain('ADVANCED');
  });
});
