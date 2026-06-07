import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insightTemplatesService } from '../../../features/data-marts/insights/model';
import DataMartInsightsPage from './DataMartInsightsPage';

const insightTemplatesServiceMock = vi.hoisted(() => ({
  getProjectInsightTemplates: vi.fn(),
  deleteInsightTemplate: vi.fn(),
}));

vi.mock('../../../features/data-marts/insights/model', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../features/data-marts/insights/model')>();
  return {
    ...actual,
    insightTemplatesService: insightTemplatesServiceMock,
  };
});

vi.mock('../../../features/idp', () => ({
  useRole: () => ({
    isAdmin: false,
    canEdit: false,
  }),
  useAuth: () => ({
    status: 'authenticated',
    user: {
      id: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
    },
  }),
}));

describe('DataMartInsightsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    insightTemplatesServiceMock.deleteInsightTemplate.mockResolvedValue(undefined);
  });

  it('loads project insights by 100 and shows their Data Mart context', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [buildInsightTemplateResponse()],
    });

    renderPage();

    expect(await screen.findByText('Insights')).toBeInTheDocument();
    expect(await screen.findByText('Revenue Summary')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marketing Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/dm-1/insights-v2'
    );
    expect(screen.getByRole('button', { name: 'Toggle columns' })).toBeInTheDocument();
    expect(insightTemplatesService.getProjectInsightTemplates).toHaveBeenCalledWith(100, 0);
  });

  it('shows Data Mart as the first table column', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [buildInsightTemplateResponse()],
    });

    renderPage();

    expect(await screen.findByText('Revenue Summary')).toBeInTheDocument();
    expect(getColumnHeaderLabels().slice(0, 2)).toEqual(['Data Mart', 'Insight']);
  });

  it('shows a Data Mart-focused empty state when there are no project-wide insights', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [],
    });

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'No insights yet' })).toBeInTheDocument();
    expect(
      screen.getByText(/Insights created from Data Mart data will appear here/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a Data Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts'
    );
    expect(container.querySelector('.lucide-sparkles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle columns' })).not.toBeInTheDocument();
  });

  it('links the Insight title to the insight details page', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [buildInsightTemplateResponse()],
    });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Revenue Summary' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts/dm-1/insights-v2/insight-1'
    );
  });

  it('does not navigate to the insight details page when clicking a non-title row area', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [buildInsightTemplateResponse()],
    });

    renderPage();

    fireEvent.click(await screen.findByRole('row', { name: /Marketing Mart Revenue Summary/ }));

    expect(screen.getByTestId('currentPath')).toHaveTextContent(
      '/ui/project-1/data-marts/insights'
    );
  });

  it('does not show the Sources column because the Data Mart insights tab does not have it', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [buildInsightTemplateResponse()],
    });

    renderPage();

    expect(await screen.findByText('Revenue Summary')).toBeInTheDocument();
    const headerLabels = getColumnHeaderLabels();
    expect(headerLabels.slice(0, 4)).toEqual(['Data Mart', 'Insight', 'Updated', 'Created By']);
    expect(headerLabels).not.toContain('Sources');
  });

  it('renders Data Marts list-style card controls and applies Data Mart URL filters', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [
        buildInsightTemplateResponse(),
        buildInsightTemplateResponse({
          id: 'insight-2',
          title: 'Product Insight',
          dataMartTitle: 'Product Mart',
        }),
      ],
    });

    const { container } = renderPage(buildFilterPath('data-marts/insights', 'Marketing Mart'));

    expect(await screen.findByText('Revenue Summary')).toBeInTheDocument();
    expect(screen.queryByText('Product Insight')).not.toBeInTheDocument();
    expect(container.querySelector('.dm-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('searches insights by the Data Mart column', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [
        buildInsightTemplateResponse(),
        buildInsightTemplateResponse({
          id: 'insight-2',
          title: 'Product Insight',
          dataMartTitle: 'Product Mart',
        }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Product Insight')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Marketing' },
    });

    expect(screen.getByText('Revenue Summary')).toBeInTheDocument();
    expect(screen.queryByText('Product Insight')).not.toBeInTheDocument();
  });

  it('searches insights by the Insight column', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [
        buildInsightTemplateResponse({
          title: 'Revenue Summary',
          dataMartTitle: 'Marketing Mart',
        }),
        buildInsightTemplateResponse({
          id: 'insight-2',
          title: 'Churn Signal',
          dataMartTitle: 'Customer Mart',
        }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Churn Signal')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Churn' },
    });

    expect(screen.getByText('Churn Signal')).toBeInTheDocument();
    expect(screen.queryByText('Revenue Summary')).not.toBeInTheDocument();
  });

  it('renders insight row actions like the Data Mart insights tab', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates).mockResolvedValueOnce({
      insights: [buildInsightTemplateResponse()],
    });

    renderPage();

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Insight actions' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText('Delete insight')).toBeInTheDocument();
  });

  it('loads additional insight pages when project search is active', async () => {
    vi.mocked(insightTemplatesService.getProjectInsightTemplates)
      .mockResolvedValueOnce({
        insights: Array.from({ length: 100 }, (_, index) =>
          buildInsightTemplateResponse({
            id: `insight-${index + 1}`,
            title: `Insight ${index + 1}`,
          })
        ),
      })
      .mockResolvedValueOnce({
        insights: [
          buildInsightTemplateResponse({
            id: 'insight-needle',
            title: 'Needle Insight',
          }),
        ],
      });

    renderPage();

    expect(await screen.findByText('Insight 1')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Needle' },
    });

    expect(await screen.findByText('Needle Insight')).toBeInTheDocument();
    expect(insightTemplatesService.getProjectInsightTemplates).toHaveBeenCalledWith(100, 100);
  });
});

function renderPage(path = '/ui/project-1/data-marts/insights') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataMartInsightsPage />
      <LocationProbe />
    </MemoryRouter>
  );
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid='currentPath'>{location.pathname}</div>;
}

function buildFilterPath(path: string, dataMartTitle: string) {
  const filters = encodeURIComponent(
    JSON.stringify([{ f: 'dataMart', o: 'eq', v: [dataMartTitle] }])
  );
  return `/ui/project-1/${path}?filters=${filters}`;
}

function getColumnHeaderLabels() {
  return screen
    .getAllByRole('columnheader')
    .map(header => header.textContent.trim())
    .filter((label): label is string => Boolean(label));
}

function buildInsightTemplateResponse(
  overrides: { id?: string; title?: string; dataMartTitle?: string } = {}
) {
  return {
    id: overrides.id ?? 'insight-1',
    title: overrides.title ?? 'Revenue Summary',
    sourcesCount: 2,
    lastRenderedTemplateUpdatedAt: null,
    createdById: 'user-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-05T12:00:00.000Z',
    createdByUser: null,
    dataMart: {
      id: 'dm-1',
      title: overrides.dataMartTitle ?? 'Marketing Mart',
    },
  };
}
