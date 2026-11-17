import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightSourcesPanel } from './InsightSourcesPanel';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  state: { sources: undefined as unknown[] | undefined, isLoading: false },
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() });
  return { default: toast, toast };
});
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@monaco-editor/react', () => ({ Editor: () => <div>SQL editor</div> }));
vi.mock('../../shared/hooks/useSqlDryRunTrigger', () => ({
  useSqlDryRunTrigger: () => ({
    isLoading: false,
    result: null,
    validateSql: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('../model', () => {
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    useInsightTemplateSources: () => ({
      data: mocks.state.sources,
      isLoading: mocks.state.isLoading,
    }),
    useCreateInsightTemplateSource: () => mutation,
    useUpdateInsightTemplateSource: () => mutation,
    useDeleteInsightTemplateSource: () => mutation,
    useInsightTemplateSourceSqlPreviewTrigger: () => ({
      isLoading: false,
      reset: vi.fn(),
      trigger: vi.fn(),
    }),
  };
});

function source(id: string, title: string) {
  return { id, key: `key_${id}`, artifactId: `art-${id}`, title, sql: 'SELECT 1' };
}

function Search() {
  return <span data-testid='search'>{useLocation().search}</span>;
}

function renderPanel(url = '/ui/p1/data-marts/dm1/insights/i1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <InsightSourcesPanel
        dataMartId='dm1'
        insightId='i1'
        canEdit
        isRunning={false}
        saving={false}
      />
      <Search />
    </MemoryRouter>
  );
}

describe('InsightSourcesPanel sheet link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.sources = [source('s1', 'Orders')];
    mocks.state.isLoading = false;
  });

  it('opens the sheet for the source in the URL and offers its link', async () => {
    renderPanel('/ui/p1/data-marts/dm1/insights/i1?source=s1');

    expect(await screen.findByText('Edit Data Artifact')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy link to this Data Artifact' })
    ).toBeInTheDocument();
  });

  it('writes the id to the URL on edit and removes it on close', async () => {
    renderPanel();

    fireEvent.click(screen.getByText('Orders'));
    expect(await screen.findByText('Edit Data Artifact')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?source=s1');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Edit Data Artifact')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('search')).toHaveTextContent('');
    });
  });

  it('shows the refreshed source when it opens again after a close', async () => {
    renderPanel();

    fireEvent.click(screen.getByText('Orders'));
    await screen.findByText('Edit Data Artifact');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Edit Data Artifact')).not.toBeInTheDocument();
    });

    // A save changed the source while the sheet was closed.
    mocks.state.sources = [source('s1', 'Renamed')];
    fireEvent.click(screen.getByText('Orders'));

    expect(await screen.findByDisplayValue('Renamed')).toBeInTheDocument();
  });

  it('toasts and removes the parameter for an unknown id', async () => {
    renderPanel('/ui/p1/data-marts/dm1/insights/i1?source=zz');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This Data Artifact was deleted or is not available.',
        { id: 'source-not-found' }
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('search')).toHaveTextContent('');
    });
    expect(screen.queryByText('Edit Data Artifact')).not.toBeInTheDocument();
  });

  it('waits for the list before it judges the id', () => {
    mocks.state.sources = undefined;
    mocks.state.isLoading = true;
    renderPanel('/ui/p1/data-marts/dm1/insights/i1?source=s1');

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search')).toHaveTextContent('?source=s1');
  });

  it('opens the create sheet without writing the URL or offering a link', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Data Artifact$/ }));
    expect(await screen.findByText('Add Data Artifact')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
    expect(screen.queryByRole('button', { name: 'Copy link to this Data Artifact' })).toBeNull();
  });
});
