import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConnectorContextProvider } from '../../../../connectors/shared/model/context';
import { DataDestinationType } from '../../../../data-destination';
import { DestinationTypeConfigEnum } from '../../../reports/shared';
import type { DataMartReport } from '../../../reports/shared/model/types/data-mart-report';
import { getGoogleSheetTabUrl } from '../../../reports/shared/utils';
import { TRIGGER_CONFIG_TYPES } from '../../enums/trigger-config-types.enum';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerRunTarget } from './ScheduledTriggerRunTarget';

function renderRunTarget(trigger: ScheduledTrigger) {
  return render(
    <ConnectorContextProvider>
      <ScheduledTriggerRunTarget trigger={trigger} />
    </ConnectorContextProvider>
  );
}

function makeReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'report-1',
    title: 'Daily Sales Report',
    dataDestination: {
      type: DataDestinationType.GOOGLE_SHEETS,
    } as DataMartReport['dataDestination'],
    destinationConfig: {
      type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
      spreadsheetId: 'spreadsheet-1',
      sheetId: '123',
    },
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    runsCount: 0,
    lastRunDate: null,
    lastRunStatus: null,
    lastRunError: null,
    ...overrides,
  } as DataMartReport;
}

function makeReportRunTrigger(report?: DataMartReport): ScheduledTrigger {
  return {
    id: 'trigger-1',
    type: ScheduledTriggerType.REPORT_RUN,
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
      reportId: report?.id ?? 'report-1',
      report,
    },
  } as unknown as ScheduledTrigger;
}

describe('ScheduledTriggerRunTarget', () => {
  it('shows the report title as plain text, not a link', () => {
    renderRunTarget(makeReportRunTrigger(makeReport()));

    expect(screen.getByText('Daily Sales Report').closest('a')).toBeNull();
  });

  it('opens the Google Sheet from a separate document action in a new tab', () => {
    renderRunTarget(makeReportRunTrigger(makeReport()));

    const link = screen.getByRole('link', { name: 'Open document: Daily Sales Report' });
    expect(link).toHaveAttribute('href', getGoogleSheetTabUrl('spreadsheet-1', '123'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not show the document action for a non-Google Sheets report', () => {
    renderRunTarget(
      makeReportRunTrigger(
        makeReport({
          dataDestination: { type: DataDestinationType.EMAIL } as DataMartReport['dataDestination'],
        })
      )
    );

    expect(screen.queryByRole('link', { name: /Open document/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report details' })).toBeInTheDocument();
  });

  it('opens the report details on click, not on hover', () => {
    renderRunTarget(makeReportRunTrigger(makeReport()));
    const detailsButton = screen.getByRole('button', { name: 'Report details' });

    fireEvent.pointerEnter(detailsButton);
    expect(screen.queryByText(/^No runs, since /)).not.toBeInTheDocument();

    fireEvent.click(detailsButton);
    expect(screen.getByText(/^No runs, since /)).toBeInTheDocument();
  });

  it('does not show report actions when the report is not hydrated', () => {
    renderRunTarget(makeReportRunTrigger());

    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open document/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report details' })).not.toBeInTheDocument();
  });

  it('does not render report actions for non-report triggers', () => {
    renderRunTarget({
      id: 'trigger-2',
      type: ScheduledTriggerType.DATA_QUALITY_RUN,
      triggerConfig: null,
    } as unknown as ScheduledTrigger);

    expect(screen.queryByRole('link', { name: /Open document/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report details' })).not.toBeInTheDocument();
  });
});
