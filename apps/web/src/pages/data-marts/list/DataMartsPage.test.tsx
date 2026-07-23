// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataMartsPage from './DataMartsPage';

const mocks = vi.hoisted(() => ({
  items: [] as { qualitySummary: { state: string } }[],
  navigate: vi.fn(),
  loadDataMarts: vi.fn().mockResolvedValue(undefined),
  refreshList: vi.fn().mockResolvedValue(undefined),
  fetchAvailableConnectors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../features/data-marts/list', () => ({
  DataMartListProvider: ({ children }: { children: React.ReactNode }) => children,
  DataMartTable: () => <div>Data Mart table</div>,
  useDataMartList: () => ({
    items: mocks.items,
    loadDataMarts: mocks.loadDataMarts,
    deleteDataMart: vi.fn(),
    publishDataMart: vi.fn(),
    refreshList: mocks.refreshList,
    loading: false,
  }),
}));

vi.mock('../../../features/data-marts/list/components/DataMartTable/columns/columns.tsx', () => ({
  getDataMartColumns: () => [],
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
  useProjectRoute: () => ({ navigate: mocks.navigate }),
}));

describe('DataMartsPage Data Quality activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items = [];
  });

  it.each(['QUEUED', 'RUNNING'])(
    'shows project Run History while a Data Quality run is %s',
    state => {
      mocks.items = [{ qualitySummary: { state } }];

      render(<DataMartsPage />);

      expect(screen.getByRole('status')).toHaveTextContent('Checking data quality');
      fireEvent.click(screen.getByRole('button', { name: 'View runs' }));
      expect(mocks.navigate).toHaveBeenCalledWith('/data-marts/runs');
    }
  );

  it('does not show activity after all Data Quality runs finish', () => {
    mocks.items = [{ qualitySummary: { state: 'PASSED' } }];

    render(<DataMartsPage />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
  });
});
