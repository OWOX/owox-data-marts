import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchButton } from './SearchButton';

const mockNavigate = vi.fn();

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({
    navigate: vi.fn(),
    scope: (path: string) => `/ui/project-1${path}`,
    projectId: 'project-1',
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderButton() {
  return renderButtonAt('/ui/project-1/data-marts');
}

function renderButtonAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SearchButton />
    </MemoryRouter>
  );
}

describe('SearchButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a link to the scoped /search route regardless of feature flags', () => {
    renderButton();

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/ui/project-1/search');
  });

  it('renders the Search label', () => {
    renderButton();

    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('marks the link as the current page when on the search route', () => {
    renderButtonAt('/ui/project-1/search');

    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark the link active on other routes', () => {
    renderButton();

    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('navigates to /search on Cmd+K (metaKey)', () => {
    renderButton();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(mockNavigate).toHaveBeenCalledWith('/ui/project-1/search');
  });

  it('navigates to /search on Ctrl+K (ctrlKey)', () => {
    renderButton();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(mockNavigate).toHaveBeenCalledWith('/ui/project-1/search');
  });

  it('dispatches focus event instead of navigating when Cmd+K is pressed on the search page', () => {
    const focusListener = vi.fn();
    window.addEventListener('owox:focus-search-input', focusListener);
    renderButtonAt('/ui/project-1/search');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(focusListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('owox:focus-search-input', focusListener);
  });

  it('does not navigate when Cmd+K is pressed with an input focused', () => {
    render(
      <MemoryRouter initialEntries={['/ui/project-1/data-marts']}>
        <input data-testid='target' />
        <SearchButton />
      </MemoryRouter>
    );

    const input = screen.getByTestId('target');
    input.focus();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
