import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DestinationTypeConfigEnum } from '../..';
import type {
  DataMartReport,
  GoogleSheetsDestinationConfig,
} from '../../model/types/data-mart-report';
import { getGoogleSheetTabUrl } from '../../utils';
import { ReportOpenDocumentAction } from '../ReportOpenDocumentAction';
import { DataDestinationType } from '../../../../../data-destination/shared/enums/data-destination-type.enum';

function makeReport(overrides: Partial<DataMartReport> = {}): DataMartReport {
  return {
    id: 'report-1',
    title: 'Monthly Revenue',
    dataDestination: {
      type: DataDestinationType.GOOGLE_SHEETS,
    } as DataMartReport['dataDestination'],
    destinationConfig: {
      type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
      spreadsheetId: 'spreadsheet-123',
      sheetId: '456',
    } satisfies GoogleSheetsDestinationConfig,
    ...overrides,
  } as DataMartReport;
}

describe('ReportOpenDocumentAction', () => {
  it('renders a link to the Google Sheets document', () => {
    render(<ReportOpenDocumentAction report={makeReport()} />);

    const link = screen.getByRole('link', {
      name: /open document: monthly revenue/i,
    });

    expect(link).toHaveAttribute('href', getGoogleSheetTabUrl('spreadsheet-123', '456'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render for non-Google Sheets reports', () => {
    render(
      <ReportOpenDocumentAction
        report={makeReport({
          dataDestination: {
            type: DataDestinationType.LOOKER_STUDIO,
          } as DataMartReport['dataDestination'],
        })}
      />
    );

    expect(
      screen.queryByRole('link', {
        name: /open document/i,
      })
    ).not.toBeInTheDocument();
  });

  it('does not render when the destination configuration is not Google Sheets', () => {
    render(
      <ReportOpenDocumentAction
        report={makeReport({
          destinationConfig: {
            type: DestinationTypeConfigEnum.EMAIL_CONFIG,
          } as DataMartReport['destinationConfig'],
        })}
      />
    );

    expect(
      screen.queryByRole('link', {
        name: /open document/i,
      })
    ).not.toBeInTheDocument();
  });

  it('does not render when the Google Sheets configuration is incomplete', () => {
    render(
      <ReportOpenDocumentAction
        report={makeReport({
          destinationConfig: {
            type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
            spreadsheetId: '',
            sheetId: '456',
          },
        })}
      />
    );

    expect(
      screen.queryByRole('link', {
        name: /open document/i,
      })
    ).not.toBeInTheDocument();
  });
});
