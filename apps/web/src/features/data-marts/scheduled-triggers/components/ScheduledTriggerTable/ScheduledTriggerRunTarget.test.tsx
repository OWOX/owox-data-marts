import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorContextProvider } from '../../../../connectors/shared/model/context';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import { DataDestinationType } from '../../../../data-destination';
import { DestinationTypeConfigEnum } from '../../../reports/shared';
import type { DataMartReport } from '../../../reports/shared/model/types/data-mart-report';
import { getGoogleSheetTabUrl } from '../../../reports/shared/utils';
import { TRIGGER_CONFIG_TYPES } from '../../enums/trigger-config-types.enum';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerRunTarget } from './ScheduledTriggerRunTarget';

const mocks = vi.hoisted(() => ({ bundledConnectors: [] as ConnectorListItem[] }));

vi.mock('../../../../connectors/shared/model/hooks/useConnector', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../connectors/shared/model/hooks/useConnector')>();
  return {
    ...actual,
    useConnector: () => ({ ...actual.useConnector(), connectors: mocks.bundledConnectors }),
  };
});

beforeEach(() => {
  mocks.bundledConnectors = [];
});

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

const FIBERY_LOGO = 'data:image/png;base64,AAAA';

function makeCustomConnectorRunTrigger(logoBase64: string | null): ScheduledTrigger {
  return {
    id: 'trigger-3',
    type: ScheduledTriggerType.CONNECTOR_RUN,
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_CONNECTOR_RUN,
      connector: {
        connector: {
          source: { name: 'fibery_api', configuration: [], node: 'entities', fields: ['id'] },
          storage: { fullyQualifiedName: 'dataset.table' },
          info: {
            name: 'fibery_api',
            displayName: 'Fibery (owox.fibery.io)',
            description: '',
            logoBase64,
            docUrl: null,
            isCustom: true,
          },
        },
      },
    },
  } as unknown as ScheduledTrigger;
}

describe('ScheduledTriggerRunTarget', () => {
  it('shows the display name and logo of a custom connector', () => {
    renderRunTarget(makeCustomConnectorRunTrigger(FIBERY_LOGO));

    expect(screen.getByText('Fibery (owox.fibery.io)')).toBeInTheDocument();
    expect(document.querySelector(`img[src="${FIBERY_LOGO}"]`)).not.toBeNull();
  });

  it('shows the Plug icon for a custom connector without a logo', () => {
    renderRunTarget(makeCustomConnectorRunTrigger(null));

    expect(document.querySelector('.lucide-plug')).not.toBeNull();
    expect(document.querySelector('.lucide-database')).toBeNull();
  });

  it('shows the bundled connector name and logo when a custom connector has the same name', () => {
    const bundledLogo = 'data:image/png;base64,BBBB';
    mocks.bundledConnectors = [
      {
        name: 'fibery_api',
        displayName: 'Fibery bundled',
        description: '',
        logoBase64: bundledLogo,
        docUrl: null,
      } as ConnectorListItem,
    ];

    renderRunTarget(makeCustomConnectorRunTrigger(FIBERY_LOGO));

    expect(screen.getByText('Fibery bundled')).toBeInTheDocument();
    expect(document.querySelector(`img[src="${bundledLogo}"]`)).not.toBeNull();
    expect(document.querySelector(`img[src="${FIBERY_LOGO}"]`)).toBeNull();
  });

  it('shows the custom connector in the hover card header', () => {
    renderRunTarget(makeCustomConnectorRunTrigger(FIBERY_LOGO));

    fireEvent.click(screen.getByRole('button', { name: 'Connector details' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Fibery (owox.fibery.io)');
    expect(dialog.querySelector(`img[src="${FIBERY_LOGO}"]`)).not.toBeNull();
  });

  it('shows the Plug icon in the hover card header for a custom connector without a logo', () => {
    renderRunTarget(makeCustomConnectorRunTrigger(null));

    fireEvent.click(screen.getByRole('button', { name: 'Connector details' }));

    expect(screen.getByRole('dialog').querySelector('.lucide-plug')).not.toBeNull();
  });

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
