import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDestinationType } from '../../../../../data-destination';
import { DataMartStatus } from '../../../../shared';
import type { DataDestination } from '../../../../../data-destination';
import { DestinationCard } from './DestinationCard';

const mocks = vi.hoisted(() => ({
  handleAddReport: vi.fn(),
  handleCloseModal: vi.fn(),
}));

vi.mock('../../../../../data-destination', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../../data-destination')>();
  return {
    ...actual,
    useDataDestination: () => ({ dataDestinations: [] }),
    useDataDestinationVisibility: () => ({
      destinationInfo: { icon: () => null },
      isVisible: true,
    }),
  };
});

vi.mock('../../model/hooks', () => ({
  useReportSidesheet: () => {
    const [isOpen, setIsOpen] = useState(false);
    return {
      isOpen,
      mode: 'create',
      editingReport: null,
      handleAddReport: () => {
        mocks.handleAddReport();
        setIsOpen(true);
      },
      handleEditReport: vi.fn(),
      handleCloseModal: mocks.handleCloseModal,
    };
  },
}));

vi.mock('../../../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared')>();
  return { ...actual, useReport: () => ({ reports: [] }) };
});

vi.mock('./index', () => ({
  AddReportButton: ({ onAddReport }: { onAddReport: () => void }) => (
    <button type='button' onClick={onAddReport}>
      New Report
    </button>
  ),
  ReportListRenderer: () => null,
  ReportEditSheetRenderer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role='dialog'>Report form</div> : null,
}));

const destination = {
  id: 'destination-1',
  title: 'Google Sheets',
  type: DataDestinationType.GOOGLE_SHEETS,
} as DataDestination;

describe('DestinationCard report creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the report form immediately for a published Data Mart', () => {
    render(<DestinationCard destination={destination} dataMartStatus={publishedStatus} />);

    fireEvent.click(screen.getByRole('button', { name: 'New Report' }));

    expect(mocks.handleAddReport).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveTextContent('Report form');
  });

  it('publishes a draft Data Mart, then opens the report form', async () => {
    const onPublishDataMart = vi.fn().mockResolvedValue(true);
    render(
      <DestinationCard
        destination={destination}
        dataMartStatus={draftStatus}
        canPublish
        onPublishDataMart={onPublishDataMart}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Report' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Publish Data Mart to create a report?'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish and create report' }));

    await waitFor(() => {
      expect(onPublishDataMart).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mocks.handleAddReport).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('Report form');
  });

  it('offers no creation for a destination that makes its own reports', () => {
    // An Excel report is bound to a worksheet by the add-in; one created here would be a report
    // no workbook refers to.
    render(
      <DestinationCard
        destination={{ ...destination, type: DataDestinationType.EXCEL } as DataDestination}
        dataMartStatus={publishedStatus}
      />
    );

    expect(screen.queryByRole('button', { name: 'New Report' })).not.toBeInTheDocument();
  });

  it('shows the setup dialog for a draft Data Mart that cannot be published', () => {
    const onReviewDataSetup = vi.fn();
    render(
      <DestinationCard
        destination={destination}
        dataMartStatus={draftStatus}
        validationErrors={[]}
        onReviewDataSetup={onReviewDataSetup}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Report' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Complete Data Mart setup first');

    fireEvent.click(screen.getByRole('button', { name: 'Open Data Setup' }));
    expect(onReviewDataSetup).toHaveBeenCalledOnce();
  });
});

const publishedStatus = {
  code: DataMartStatus.PUBLISHED,
  displayName: 'Published',
  description: '',
};
const draftStatus = { code: DataMartStatus.DRAFT, displayName: 'Draft', description: '' };
