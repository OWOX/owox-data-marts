import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataDestinationType } from '../../../../../data-destination';
import type { DataDestination } from '../../../../../data-destination';
import { ReportsTable } from './ReportsTable';

vi.mock('../../../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared')>();
  return { ...actual, useReport: () => ({ reports: [], setPollingConfig: vi.fn() }) };
});

vi.mock('../../../../../../components/AppSidebar/SetupChecklist/useSetupProgress', () => ({
  useRefreshSetupProgress: () => vi.fn(),
}));

vi.mock('./columns', () => ({ getReportColumns: () => [] }));

vi.mock('../DestinationCard/AddReportButton', () => ({
  AddReportButton: () => (
    <button type='button' onClick={() => undefined}>
      New Report
    </button>
  ),
}));

function renderTable(type: DataDestinationType) {
  render(
    <ReportsTable
      destination={{ id: 'destination-1', title: 'Microsoft Excel', type } as DataDestination}
      onEditReport={vi.fn()}
      onAddReport={vi.fn()}
    />
  );
}

describe('ReportsTable empty state', () => {
  it('sends an Excel destination to the add-in, where its reports are made', () => {
    renderTable(DataDestinationType.EXCEL);

    const link = screen.getByRole('link', { name: /OWOX add-in in Excel/ });

    // The Marketplace installation link: it opens Excel with the add-in loaded rather than
    // explaining how to get there, which is the whole point of linking the add-in itself.
    expect(link).toHaveAttribute(
      'href',
      'https://go.microsoft.com/fwlink/?linkid=2261819&templateid=WA200011946&templatetitle=OWOX%20Data%20Marts'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'New Report' })).not.toBeInTheDocument();
  });

  it('offers report creation, not the add-in, where this app makes the report', () => {
    renderTable(DataDestinationType.GOOGLE_SHEETS);

    expect(screen.getByRole('button', { name: 'New Report' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /OWOX add-in in Excel/ })).not.toBeInTheDocument();
  });
});
