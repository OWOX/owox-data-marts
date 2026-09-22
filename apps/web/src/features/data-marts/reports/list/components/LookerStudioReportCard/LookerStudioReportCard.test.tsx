import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { LookerStudioReportCard } from './LookerStudioReportCard';

const mocks = vi.hoisted(() => ({
  useLookerStudioReport: vi.fn(),
}));

vi.mock('./hooks/useLookerStudioReport', () => ({
  useLookerStudioReport: mocks.useLookerStudioReport,
}));

const destination = {
  id: 'destination-123',
  title: 'Marketing Data Studio',
} as DataDestination;

const report = {
  id: 'report-456',
  dataMart: { title: 'Revenue by channel' },
} as DataMartReport;

describe('LookerStudioReportCard', () => {
  beforeEach(() => {
    mocks.useLookerStudioReport.mockReturnValue({
      existingReport: report,
      isLoading: false,
      isEnabled: true,
      isChecked: true,
      dynamicTitle: 'Available in Data Studio',
      handleSwitchChange: vi.fn(),
    });
  });

  it('creates a named Data Studio data source for the enabled Data Mart', () => {
    render(
      <LookerStudioReportCard
        data-testid='reportCard'
        destination={destination}
        onEditReport={vi.fn()}
      />
    );

    const link = screen.getByRole('link', { name: 'Connect in Data Studio' });
    const url = new URL(link.getAttribute('href')!);

    expect(url.origin).toBe('https://datastudio.google.com');
    expect(url.pathname).toBe('/reporting/create');
    expect(url.searchParams.get('ds.connector')).toBe('community');
    expect(url.searchParams.get('ds.connectorId')).toBe(
      'AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A'
    );
    expect(url.searchParams.get('ds.datasourceName')).toBe('Revenue by channel');
    expect(url.searchParams.get('ds.destinationId')).toBe('destination-123');
    expect(url.searchParams.get('ds.reportId')).toBe('report-456');
    expect(url.searchParams.get('connectorConfig')).toBeNull();
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.parentElement).toBe(screen.getByTestId('reportCard'));
    expect(link.querySelector('.lucide-external-link')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not open the report editor when the connection link is clicked', () => {
    const onEditReport = vi.fn();
    render(<LookerStudioReportCard destination={destination} onEditReport={onEditReport} />);

    fireEvent.click(screen.getByRole('link', { name: 'Connect in Data Studio' }));

    expect(onEditReport).not.toHaveBeenCalled();
  });

  it('vertically centers the connection action alongside the card content', () => {
    render(<LookerStudioReportCard destination={destination} onEditReport={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'Connect in Data Studio' });

    expect(link).toHaveClass('self-center');
    expect(link).not.toHaveClass('mt-4');
  });
});
