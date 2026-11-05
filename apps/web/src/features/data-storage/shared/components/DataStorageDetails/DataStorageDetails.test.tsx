import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataStorageType } from '../../model/types';
import { DataStorageDetails } from './DataStorageDetails';

const base = {
  id: 's1',
  title: 'Storage',
  type: DataStorageType.GOOGLE_BIGQUERY,
  config: { projectId: 'customer-project', location: 'EU' },
  createdAt: new Date('2026-01-01'),
  modifiedAt: new Date('2026-01-02'),
};

describe('DataStorageDetails', () => {
  it('shows an OWOX Storage as such, with location and dataset and no project id', () => {
    render(
      <DataStorageDetails
        dataStorage={
          {
            ...base,
            config: { projectId: 'owox-gcp', location: 'US' },
            owoxStorage: { location: 'US', datasetId: 'owox_abc' },
          } as never
        }
      />
    );

    expect(screen.getByText('OWOX Storage')).toBeInTheDocument();
    expect(screen.queryByText('Google BigQuery')).not.toBeInTheDocument();
    expect(screen.queryByText('Project ID:')).not.toBeInTheDocument();
    expect(screen.queryByText('owox-gcp')).not.toBeInTheDocument();
    expect(screen.getByText('Location:')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('Dataset:')).toBeInTheDocument();
    expect(screen.getByText('owox_abc')).toBeInTheDocument();
  });

  it('renders a plain BigQuery storage as before', () => {
    render(<DataStorageDetails dataStorage={base as never} />);

    expect(screen.getByText('Google BigQuery')).toBeInTheDocument();
    expect(screen.getByText('Project ID:')).toBeInTheDocument();
    expect(screen.getByText('customer-project')).toBeInTheDocument();
    expect(screen.queryByText('Dataset:')).not.toBeInTheDocument();
  });
});
