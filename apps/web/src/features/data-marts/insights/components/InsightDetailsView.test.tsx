import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InsightDetailsView from './InsightDetailsView';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  sheetProps: null as null | {
    isOpen: boolean;
    mode: string;
    initialReport?: { id: string; title: string };
    onClose: () => void;
  },
  state: {
    reports: undefined as
      | { id: string; title: string; dataDestination: { type: string } }[]
      | undefined,
  },
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() });
  return { default: toast, toast };
});
vi.mock('../../edit/model', () => ({
  useDataMartContext: () => ({ dataMart: { id: 'dm1', status: { code: 'PUBLISHED' } } }),
}));
vi.mock('../../../../app/permissions', () => ({
  NO_PERMISSION_MESSAGE: 'No permission',
  usePermissions: () => ({ canEdit: true, canDelete: true }),
}));
vi.mock('../model', () => ({
  useInsightTemplateSources: () => ({ data: [], refetch: vi.fn() }),
  insightTemplatesService: {
    getInsightTemplateById: vi.fn().mockResolvedValue({ id: 'i1', title: 'Insight' }),
  },
  mapInsightTemplateFromDto: (dto: { id: string; title: string }) => ({
    ...dto,
    template: '',
    lastRenderedTemplate: null,
  }),
}));
vi.mock('../../reports/list/model/hooks/useReportsByInsightTemplate', () => ({
  useReportsByInsightTemplate: () => ({ data: mocks.state.reports }),
}));
vi.mock('../../reports/edit', () => ({
  EmailReportEditSheet: (props: NonNullable<typeof mocks.sheetProps>) => {
    mocks.sheetProps = props;
    return null;
  },
}));
vi.mock('./InsightReportsSheet', () => ({
  InsightReportsSheet: ({
    isOpen,
    onClose,
    onEditReport,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onEditReport: (report: { id: string }) => void;
  }) =>
    isOpen ? (
      <button
        type='button'
        onClick={() => {
          // The real list closes itself before it hands the report over.
          onClose();
          onEditReport({ id: 'r1' });
        }}
      >
        Edit report r1
      </button>
    ) : null,
}));
vi.mock('./InsightSourcesPanel', () => ({ InsightSourcesPanel: () => null }));
vi.mock('./AiAssistantPanel.tsx', () => ({ AiAssistantPanel: () => null }));
vi.mock('./InsightTemplateEditor', () => ({ InsightTemplateEditor: () => null }));
vi.mock('./InsightLoader', () => ({ InsightLoader: () => null }));
vi.mock('../../../../shared/components/MarkdownEditor', () => ({
  MarkdownEditorPreview: () => null,
  useMarkdownPreview: () => ({}),
}));
vi.mock('../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx', () => ({
  InlineEditTitle: () => null,
}));

function Search() {
  return <span data-testid='search'>{useLocation().search}</span>;
}

function renderView(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/ui/p1/data-marts/dm1/insights/i1${search}`]}>
      <Routes>
        <Route path='/ui/p1/data-marts/dm1/insights/:insightId' element={<InsightDetailsView />} />
      </Routes>
      <Search />
    </MemoryRouter>
  );
}

describe('InsightDetailsView report sheet link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sheetProps = null;
    mocks.state.reports = [{ id: 'r1', title: 'Weekly', dataDestination: { type: 'EMAIL' } }];
  });

  it('opens the report sheet in edit mode for the report in the URL', async () => {
    renderView('?reportId=r1');

    await waitFor(() => {
      expect(mocks.sheetProps?.isOpen).toBe(true);
    });
    expect(mocks.sheetProps?.mode).toBe('edit');
    expect(mocks.sheetProps?.initialReport).toMatchObject({ id: 'r1' });
  });

  it('toasts and removes the parameter for an unknown id', async () => {
    renderView('?reportId=zz');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This report was deleted or is not available.',
        { id: 'reportId-not-found' }
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('search')).toHaveTextContent('');
    });
    expect(mocks.sheetProps?.isOpen).toBe(false);
  });

  it('waits for the reports before it judges the id', async () => {
    mocks.state.reports = undefined;
    renderView('?reportId=r1');

    await screen.findByTestId('search');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search')).toHaveTextContent('?reportId=r1');
    expect(mocks.sheetProps?.isOpen).toBe(false);
  });

  it('opens the create sheet without writing the URL', async () => {
    mocks.state.reports = [];
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /Send & Schedule/ }));
    await waitFor(() => {
      expect(mocks.sheetProps?.isOpen).toBe(true);
    });
    expect(mocks.sheetProps?.mode).toBe('create');
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('writes the id on edit from the list, removes it on close and reopens the list', async () => {
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /Send & Schedule/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit report r1' }));
    await waitFor(() => {
      expect(screen.getByTestId('search')).toHaveTextContent('?reportId=r1');
    });
    expect(mocks.sheetProps?.mode).toBe('edit');
    expect(screen.queryByRole('button', { name: 'Edit report r1' })).toBeNull();

    act(() => {
      mocks.sheetProps?.onClose();
    });
    await waitFor(() => {
      expect(screen.getByTestId('search')).toHaveTextContent('');
    });
    expect(mocks.sheetProps?.isOpen).toBe(false);
    // The closing sheet keeps its report until it is gone.
    expect(mocks.sheetProps?.mode).toBe('edit');
    expect(screen.getByRole('button', { name: 'Edit report r1' })).toBeInTheDocument();
  });

  it('shows the refreshed report when it opens again after a close', async () => {
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /Send & Schedule/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit report r1' }));
    await waitFor(() => {
      expect(mocks.sheetProps?.initialReport).toMatchObject({ title: 'Weekly' });
    });
    act(() => {
      mocks.sheetProps?.onClose();
    });
    await waitFor(() => {
      expect(mocks.sheetProps?.isOpen).toBe(false);
    });

    // A save or a refetch changed the report while the sheet was closed.
    mocks.state.reports = [{ id: 'r1', title: 'Renamed', dataDestination: { type: 'EMAIL' } }];
    fireEvent.click(await screen.findByRole('button', { name: 'Edit report r1' }));

    await waitFor(() => {
      expect(mocks.sheetProps?.initialReport).toMatchObject({ title: 'Renamed' });
    });
  });
});
