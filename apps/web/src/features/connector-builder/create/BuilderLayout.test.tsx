import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

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

describe('Builder layout (airbyte-style)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows nav rail and center; the test panel is collapsed by default and toggles open/closed', () => {
    render(<ConnectorBuilderPage />);

    expect(screen.getByTestId('builder-nav-rail')).toBeInTheDocument();
    expect(screen.getByTestId('builder-center')).toBeInTheDocument();
    // The dock is collapsed by default — only its header (titled "Test fetch") shows, not the body.
    expect(screen.getByText('Test fetch')).toBeInTheDocument();
    expect(screen.queryByTestId('test-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-test'));
    expect(screen.getByTestId('test-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-test'));
    expect(screen.queryByTestId('test-panel')).not.toBeInTheDocument();
  });
});
