// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataMartsPage from './DataMartsPage';

const mocks = vi.hoisted(() => ({
  items: [] as { id: string }[],
  summaries: {} as Partial<Record<string, { state: string }>>,
  useDataQualitySummaries: vi.fn(),
  navigate: vi.fn(),
  loadDataMarts: vi.fn().mockResolvedValue(undefined),
  refreshList: vi.fn().mockResolvedValue(undefined),
  fetchAvailableConnectors: vi.fn().mockResolvedValue(undefined),
  getDataMartColumns: vi.fn().mockReturnValue([]),
  loadCustomConnectors: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../features/data-marts/list', () => ({
  DataMartListProvider: ({ children }: { children: React.ReactNode }) => children,
  DataMartTable: ({
    onVisibleDataMartIdsChange,
  }: {
    onVisibleDataMartIdsChange: (ids: string[]) => void;
  }) => (
    <button
      type='button'
      onClick={() => {
        onVisibleDataMartIdsChange(['visible-mart']);
      }}
    >
      Report visible rows
    </button>
  ),
  useDataMartList: () => ({
    items: mocks.items,
    loadDataMarts: mocks.loadDataMarts,
    deleteDataMart: vi.fn(),
    publishDataMart: vi.fn(),
    refreshList: mocks.refreshList,
    loading: false,
  }),
}));

vi.mock('../../../features/data-marts/data-quality', () => ({
  useDataQualitySummaries: (projectId: string, dataMartIds: string[]) =>
    mocks.useDataQualitySummaries(projectId, dataMartIds),
}));

vi.mock('../../../features/data-marts/list/components/DataMartTable/columns/columns.tsx', () => ({
  getDataMartColumns: mocks.getDataMartColumns,
}));

vi.mock('../../../features/connectors/shared/utils', () => ({
  loadCustomConnectors: mocks.loadCustomConnectors,
}));

vi.mock('../../../features/connectors/shared/model/context', () => ({
  ConnectorContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../../features/connectors/shared/model/hooks/useConnector.ts', () => ({
  useConnector: () => ({
    connectors: [],
    fetchAvailableConnectors: mocks.fetchAvailableConnectors,
  }),
}));

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: mocks.navigate, projectId: 'project-1' }),
}));

describe('DataMartsPage Data Quality activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCustomConnectors.mockResolvedValue([]);
    mocks.items = [];
    mocks.summaries = {};
    mocks.useDataQualitySummaries.mockImplementation(
      (_projectId: string, dataMartIds: string[]) => ({
        data: Object.fromEntries(
          dataMartIds.flatMap(dataMartId => {
            const summary = mocks.summaries[dataMartId];
            return summary ? [[dataMartId, summary]] : [];
          })
        ),
      })
    );
  });

  it.each(['QUEUED', 'RUNNING'])(
    'shows project Run History while a visible Data Quality run is %s',
    state => {
      mocks.items = [{ id: 'visible-mart' }, { id: 'hidden-mart' }];
      mocks.summaries = { 'visible-mart': { state } };

      render(<DataMartsPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Report visible rows' }));

      expect(screen.getByRole('status')).toHaveTextContent('Checking data quality');
      expect(mocks.useDataQualitySummaries).toHaveBeenLastCalledWith('project-1', ['visible-mart']);
      fireEvent.click(screen.getByRole('button', { name: 'View runs' }));
      expect(mocks.navigate).toHaveBeenCalledWith('/data-marts/runs');
    }
  );

  it('does not show activity for a running Data Mart outside the current page', () => {
    mocks.items = [{ id: 'visible-mart' }, { id: 'hidden-mart' }];
    mocks.summaries = {
      'visible-mart': { state: 'PASSED' },
      'hidden-mart': { state: 'RUNNING' },
    };

    render(<DataMartsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Report visible rows' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
  });

  it('resolves custom connector titles and logos in the Input Source column', async () => {
    const custom = { name: 'MyApi', displayName: 'My API', isCustom: true };
    mocks.loadCustomConnectors.mockResolvedValue([custom]);

    render(<DataMartsPage />);

    await waitFor(() => {
      expect(mocks.getDataMartColumns).toHaveBeenLastCalledWith({ connectors: [custom] });
    });
  });
});
