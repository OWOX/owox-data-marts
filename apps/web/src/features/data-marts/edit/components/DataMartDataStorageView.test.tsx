import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../data-storage';
import { DataMartDataStorageView } from './DataMartDataStorageView';

vi.mock('../../../data-storage/edit', () => ({ DataStorageConfigSheet: () => null }));
vi.mock('../../../data-storage/shared/model/hooks/useDataStorageHealthStatus.ts', () => ({
  useDataStorageHealthStatus: () => ({ status: 'VALID', errorMessage: '', isFetched: true }),
}));
vi.mock('../../../../utils', () => ({ trackEvent: vi.fn() }));

const base = {
  id: 's1',
  title: 'Storage',
  type: DataStorageType.GOOGLE_BIGQUERY,
  config: { projectId: 'proj-1', location: 'EU' },
  createdAt: new Date('2026-01-01'),
  modifiedAt: new Date('2026-01-02'),
};

describe('DataMartDataStorageView', () => {
  it('shows Location and Dataset of an OWOX Storage, with no project id or console link', () => {
    const { container } = render(
      <DataMartDataStorageView
        dataStorage={
          {
            ...base,
            config: { projectId: 'owox-gcp', location: 'US' },
            owoxStorage: { location: 'US', datasetId: 'owox_x' },
          } as never
        }
      />
    );

    expect(screen.getByText('Location:')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('Dataset:')).toBeInTheDocument();
    expect(screen.getByText('owox_x')).toBeInTheDocument();
    expect(screen.queryByText('Project ID:')).not.toBeInTheDocument();
    expect(screen.queryByText('owox-gcp')).not.toBeInTheDocument();
    expect(container.querySelector('a[href*="console.cloud.google.com"]')).toBeNull();
  });

  it('links the Project ID of a plain BigQuery storage to the console', () => {
    const { container } = render(<DataMartDataStorageView dataStorage={base as never} />);

    expect(screen.getByText('Project ID:')).toBeInTheDocument();
    expect(container.querySelector('a[href*="console.cloud.google.com"]')).not.toBeNull();
  });
});
