import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';
import type { UseSearchResult } from './useSearch';

const mockNavigate = vi.fn();

vi.mock('../../shared/hooks', () => ({
  useProjectRoute: () => ({
    navigate: mockNavigate,
    scope: (path: string) => `/ui/project-1${path}`,
    projectId: 'project-1',
  }),
}));

const { mockUseSearch } = vi.hoisted(() => ({
  mockUseSearch: vi.fn<() => UseSearchResult>(),
}));

vi.mock('./useSearch', () => ({
  useSearch: mockUseSearch,
  MIN_QUERY_LENGTH: 2,
}));

function defaultSearchState(overrides?: Partial<UseSearchResult>): UseSearchResult {
  return {
    results: [],
    isFetching: false,
    hasQuery: false,
    isError: false,
    error: null,
    retry: vi.fn(),
    isDebouncing: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue(defaultSearchState());
  });

  describe('empty state', () => {
    it('renders the search input', () => {
      renderPage();
      expect(screen.getByRole('textbox', { name: /search/i })).toBeInTheDocument();
    });

    it('shows a prompt to start typing when there is no query', () => {
      renderPage();
      expect(screen.getByText(/start typing to search/i)).toBeInTheDocument();
    });

    it('shows no results text when fetching with a query', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({ hasQuery: true, isFetching: true, results: [] })
      );
      renderPage();
      expect(screen.getByText('Searching…')).toBeInTheDocument();
    });

    it('shows "no results found" when query has no matches', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({ hasQuery: true, isFetching: false, results: [] })
      );
      renderPage();
      expect(screen.getByText('No results found.')).toBeInTheDocument();
    });

    it('shows an inline error instead of no-results when search fails', () => {
      const retry = vi.fn();
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          isError: true,
          error: new Error('Forbidden'),
          retry,
        })
      );

      renderPage();

      expect(screen.getByText('Search failed.')).toBeInTheDocument();
      expect(screen.queryByText('No results found.')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('hides stale results while the visible query is still debouncing', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          isDebouncing: true,
          results: [
            {
              entityType: 'DATA_MART',
              entityId: 'dm-1',
              title: 'Old Result',
              description: null,
              finalScore: 0.9,
              kwScore: 0.9,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );

      renderPage();

      expect(screen.getByText('Searching…')).toBeInTheDocument();
      expect(screen.queryByText('Old Result')).not.toBeInTheDocument();
    });
  });

  describe('ENTITY_TYPE_META — DATA_MART', () => {
    it('renders a DATA_MART result with label "Data Mart"', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_MART',
              entityId: 'dm-1',
              title: 'My Data Mart',
              description: null,
              finalScore: 0.9,
              kwScore: 0.9,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByText('My Data Mart')).toBeInTheDocument();
      expect(screen.getByText('Data Mart')).toBeInTheDocument();
    });

    it('renders a link to the data-mart detail route', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_MART',
              entityId: 'dm-42',
              title: 'My Data Mart',
              description: null,
              finalScore: 0.9,
              kwScore: 0.9,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByRole('link', { name: /my data mart/i })).toHaveAttribute(
        'href',
        '/ui/project-1/data-marts/dm-42/data-setup'
      );
    });
  });

  describe('ENTITY_TYPE_META — DATA_STORAGE', () => {
    it('renders a DATA_STORAGE result with label "Storage"', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_STORAGE',
              entityId: 'storage-1',
              title: 'My BigQuery Storage',
              description: null,
              finalScore: 0.85,
              kwScore: 0.85,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByText('My BigQuery Storage')).toBeInTheDocument();
      expect(screen.getByText('Storage')).toBeInTheDocument();
    });

    it('renders a link to /data-storages?id=<entityId>', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_STORAGE',
              entityId: 'storage-99',
              title: 'My BigQuery Storage',
              description: null,
              finalScore: 0.85,
              kwScore: 0.85,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByRole('link', { name: /my bigquery storage/i })).toHaveAttribute(
        'href',
        '/ui/project-1/data-storages?id=storage-99'
      );
    });
  });

  describe('ENTITY_TYPE_META — DATA_DESTINATION', () => {
    it('renders a DATA_DESTINATION result with label "Destination"', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_DESTINATION',
              entityId: 'dest-1',
              title: 'Google Sheets Report',
              description: null,
              finalScore: 0.8,
              kwScore: 0.8,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByText('Google Sheets Report')).toBeInTheDocument();
      expect(screen.getByText('Destination')).toBeInTheDocument();
    });

    it('renders a link to /data-destinations?id=<entityId>', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_DESTINATION',
              entityId: 'dest-77',
              title: 'Google Sheets Report',
              description: null,
              finalScore: 0.8,
              kwScore: 0.8,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByRole('link', { name: /google sheets report/i })).toHaveAttribute(
        'href',
        '/ui/project-1/data-destinations?id=dest-77'
      );
    });
  });

  describe('unknown entityType fallback', () => {
    it('shows a fallback when the results contain only an unrecognised entityType', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'FUTURE_UNKNOWN_TYPE' as never,
              entityId: 'x-1',
              title: 'Mystery Entity',
              description: null,
              finalScore: 0.5,
              kwScore: 0.5,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByText(/some results could not be displayed/i)).toBeInTheDocument();
      expect(screen.queryByText('Mystery Entity')).not.toBeInTheDocument();
    });
  });

  describe('mixed results grouping', () => {
    it('renders all three entity types in a single results list', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_MART',
              entityId: 'dm-1',
              title: 'Alpha Mart',
              description: null,
              finalScore: 0.9,
              kwScore: 0.9,
              vecScore: null,
              extendability: 0,
            },
            {
              entityType: 'DATA_STORAGE',
              entityId: 'storage-1',
              title: 'Beta Storage',
              description: null,
              finalScore: 0.85,
              kwScore: 0.85,
              vecScore: null,
              extendability: 0,
            },
            {
              entityType: 'DATA_DESTINATION',
              entityId: 'dest-1',
              title: 'Gamma Destination',
              description: null,
              finalScore: 0.8,
              kwScore: 0.8,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByText('Alpha Mart')).toBeInTheDocument();
      expect(screen.getByText('Beta Storage')).toBeInTheDocument();
      expect(screen.getByText('Gamma Destination')).toBeInTheDocument();
      expect(screen.getByText('Data Mart')).toBeInTheDocument();
      expect(screen.getByText('Storage')).toBeInTheDocument();
      expect(screen.getByText('Destination')).toBeInTheDocument();
    });

    it('renders exactly 3 result links for 3 known results', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_MART',
              entityId: 'dm-1',
              title: 'Alpha Mart',
              description: null,
              finalScore: 0.9,
              kwScore: 0.9,
              vecScore: null,
              extendability: 0,
            },
            {
              entityType: 'DATA_STORAGE',
              entityId: 'storage-1',
              title: 'Beta Storage',
              description: null,
              finalScore: 0.85,
              kwScore: 0.85,
              vecScore: null,
              extendability: 0,
            },
            {
              entityType: 'DATA_DESTINATION',
              entityId: 'dest-1',
              title: 'Gamma Destination',
              description: null,
              finalScore: 0.8,
              kwScore: 0.8,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getAllByRole('link')).toHaveLength(3);
    });

    it('skips unknown-type items in a mixed list without crashing', () => {
      mockUseSearch.mockReturnValue(
        defaultSearchState({
          hasQuery: true,
          results: [
            {
              entityType: 'DATA_MART',
              entityId: 'dm-1',
              title: 'Known Mart',
              description: null,
              finalScore: 0.9,
              kwScore: 0.9,
              vecScore: null,
              extendability: 0,
            },
            {
              entityType: 'FUTURE_TYPE' as never,
              entityId: 'future-1',
              title: 'Future Thing',
              description: null,
              finalScore: 0.7,
              kwScore: 0.7,
              vecScore: null,
              extendability: 0,
            },
          ],
        })
      );
      renderPage();
      expect(screen.getByText('Known Mart')).toBeInTheDocument();
      expect(screen.queryByText('Future Thing')).not.toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
  });

  describe('query input wiring', () => {
    it('passes the typed query to useSearch', () => {
      renderPage();
      const input = screen.getByRole('textbox', { name: /search/i });
      fireEvent.change(input, { target: { value: 'big' } });
      expect(mockUseSearch).toHaveBeenLastCalledWith('big');
    });
  });
});
