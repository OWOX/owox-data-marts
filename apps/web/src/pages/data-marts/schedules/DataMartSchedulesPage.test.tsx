import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDestinationType } from '../../../features/data-destination';
import { DataDestinationCredentialsType } from '../../../features/data-destination/shared/enums/data-destination-credentials-type.enum';
import { DataStorageType } from '../../../features/data-storage/shared';
import { ScheduledTriggerType } from '../../../features/data-marts/scheduled-triggers/enums';
import { TRIGGER_CONFIG_TYPES } from '../../../features/data-marts/scheduled-triggers/enums/trigger-config-types.enum';
import type { ProjectScheduledTriggerResponseApiDto } from '../../../features/data-marts/scheduled-triggers/model/api/response/scheduled-trigger.response.dto';
import { scheduledTriggerService } from '../../../features/data-marts/scheduled-triggers/services';
import { DestinationTypeConfigEnum } from '../../../features/data-marts/reports/shared/enums/destination-type-config.enum';
import { ReportConditionEnum } from '../../../features/data-marts/reports/shared/enums/report-condition.enum';
import { TemplateSourceTypeEnum } from '../../../features/data-marts/reports/shared/enums/template-source-type.enum';
import type { ReportResponseDto } from '../../../features/data-marts/reports/shared/services';
import { DataMartStatus, DataMartDefinitionType } from '../../../features/data-marts/shared';
import DataMartSchedulesPage from './DataMartSchedulesPage';

const scheduledTriggerServiceMock = vi.hoisted(() => ({
  getProjectScheduledTriggers: vi.fn(),
}));

const connectorApiServiceMock = vi.hoisted(() => ({
  getAvailableConnectors: vi.fn(),
}));

vi.mock('../../../features/data-marts/scheduled-triggers/services', () => ({
  scheduledTriggerService: scheduledTriggerServiceMock,
}));

vi.mock('../../../features/connectors/shared/api', () => ({
  ConnectorApiService: vi.fn(function () {
    return connectorApiServiceMock;
  }),
}));

vi.mock('../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerForm', () => ({
  ScheduledTriggerForm: ({ initialData }: { initialData?: { cronExpression: string } }) => (
    <div>Trigger form {initialData?.cronExpression}</div>
  ),
}));

vi.mock('../../../features/idp', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: {
      id: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
    },
  }),
}));

describe('DataMartSchedulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    connectorApiServiceMock.getAvailableConnectors.mockResolvedValue([
      {
        name: 'FacebookMarketing',
        title: 'Facebook Marketing',
        description: null,
        logo: 'data:image/png;base64,facebook-logo',
        docUrl: null,
      },
    ]);
  });

  it('shows the run target for project-wide scheduled triggers', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Run Target')).toBeInTheDocument();
    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Toggle columns' })).toBeInTheDocument();
    expect(scheduledTriggerService.getProjectScheduledTriggers).toHaveBeenCalledWith(100, 0);
  });

  it('shows Data Mart as the first table column', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(getColumnHeaderLabels().slice(0, 2)).toEqual(['Data Mart', 'Trigger Type']);
  });

  it('shows a Data Mart-focused empty state when there are no project-wide triggers', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [],
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'No triggers yet' })).toBeInTheDocument();
    expect(
      screen.getByText(/Triggers created inside Data Marts will appear here/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a Data Mart' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-marts'
    );
    expect(screen.queryByRole('button', { name: 'Toggle columns' })).not.toBeInTheDocument();
  });

  it('renders Data Marts list-style card controls and applies Data Mart URL filters', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        buildProjectReportTrigger(),
        buildProjectReportTrigger({
          id: 'trigger-2',
          reportId: 'report-2',
          reportTitle: 'Product Report',
          dataMartTitle: 'Product Mart',
        }),
      ],
    });

    const { container } = renderPage(buildFilterPath('data-marts/schedules', 'Marketing Mart'));

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.queryByText('Product Report')).not.toBeInTheDocument();
    expect(container.querySelector('.dm-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('searches triggers by the Data Mart column', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        buildProjectReportTrigger(),
        buildProjectReportTrigger({
          id: 'trigger-2',
          reportId: 'report-2',
          reportTitle: 'Product Report',
          dataMartTitle: 'Product Mart',
        }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Product Report')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Marketing' },
    });

    expect(screen.getByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.queryByText('Product Report')).not.toBeInTheDocument();
  });

  it('searches triggers by the Run Target column', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        buildProjectReportTrigger({
          reportTitle: 'Daily Sales Report',
          dataMartTitle: 'Marketing Mart',
        }),
        buildProjectReportTrigger({
          id: 'trigger-2',
          reportId: 'report-2',
          reportTitle: 'Inventory Audit',
          dataMartTitle: 'Warehouse Mart',
        }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Inventory Audit')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Inventory' },
    });

    expect(screen.getByText('Inventory Audit')).toBeInTheDocument();
    expect(screen.queryByText('Daily Sales Report')).not.toBeInTheDocument();
  });

  it('opens the trigger edit sheet when a trigger row is clicked', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));

    expect(await screen.findByTestId('projectTriggerEditSheet')).toBeInTheDocument();
    expect(screen.getByText('Trigger form 0 9 * * *')).toBeInTheDocument();
  });

  it('renders trigger row actions like the Data Mart triggers tab', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText('Edit trigger')).toBeInTheDocument();
    expect(screen.getByText('Delete trigger')).toBeInTheDocument();
  });

  it('restores hidden columns like the Data Mart triggers tab', async () => {
    localStorage.setItem(
      'project-data-mart-scheduled-triggers-column-visibility',
      JSON.stringify({ triggerConfig: false })
    );
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Trigger Type')).toBeInTheDocument();
    expect(screen.queryByText('Run Target')).not.toBeInTheDocument();
    expect(screen.queryByText('Daily Sales Report')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle columns' })).toBeInTheDocument();
  });

  it('does not crash when a project-wide report trigger has no hydrated report', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTriggerWithoutReport()],
    });

    renderPage();

    expect(await screen.findByText('Run Target')).toBeInTheDocument();
    expect(await screen.findByText('Report')).toBeInTheDocument();
  });

  it('does not crash when a project-wide connector trigger has no hydrated connector', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTriggerWithoutConfig()],
    });

    renderPage();

    expect(await screen.findByText('Run Target')).toBeInTheDocument();
    expect(await screen.findByText('Connector')).toBeInTheDocument();
  });

  it('renders a project-wide connector trigger with the connector type title', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Run Target')).toBeInTheDocument();
    expect(await screen.findByText('Facebook Marketing')).toBeInTheDocument();
  });

  it('uses the connector type icon for project-wide connector trigger run targets', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTrigger()],
    });

    renderPage();

    const connectorIcon = await screen.findByRole('img', { name: 'icon' });
    expect(connectorIcon).toHaveAttribute('src', 'data:image/png;base64,facebook-logo');
  });

  it('loads additional trigger pages when project search is active', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers)
      .mockResolvedValueOnce({
        triggers: Array.from({ length: 100 }, (_, index) =>
          buildProjectReportTrigger({
            id: `trigger-${index + 1}`,
            reportId: `report-${index + 1}`,
            reportTitle: `Report ${index + 1}`,
          })
        ),
      })
      .mockResolvedValueOnce({
        triggers: [
          buildProjectReportTrigger({
            id: 'trigger-needle',
            reportId: 'report-needle',
            reportTitle: 'Needle Trigger Target',
          }),
        ],
      });

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Needle' },
    });

    expect(await screen.findByText('Needle Trigger Target')).toBeInTheDocument();
    expect(scheduledTriggerService.getProjectScheduledTriggers).toHaveBeenCalledWith(100, 100);
  });
});

function renderPage(path = '/ui/project-1/data-marts/schedules') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataMartSchedulesPage />
    </MemoryRouter>
  );
}

function buildFilterPath(path: string, dataMartTitle: string) {
  const filters = encodeURIComponent(
    JSON.stringify([{ f: 'dataMart', o: 'eq', v: [dataMartTitle] }])
  );
  return `/ui/project-1/${path}?filters=${filters}`;
}

function getColumnHeaderLabels() {
  return screen
    .getAllByRole('columnheader')
    .map(header => header.textContent.trim())
    .filter((label): label is string => Boolean(label));
}

function buildProjectReportTrigger(
  overrides: { id?: string; reportId?: string; reportTitle?: string; dataMartTitle?: string } = {}
): ProjectScheduledTriggerResponseApiDto {
  const reportId = overrides.reportId ?? 'report-1';

  return {
    id: overrides.id ?? 'trigger-1',
    type: ScheduledTriggerType.REPORT_RUN,
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    isActive: true,
    nextRunTimestamp: '2026-06-06T09:00:00.000Z',
    lastRunTimestamp: null,
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
      reportId,
      report: buildReportResponse({
        id: reportId,
        title: overrides.reportTitle,
      }),
    } as unknown as ProjectScheduledTriggerResponseApiDto['triggerConfig'],
    createdById: 'user-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-01T00:00:00.000Z',
    createdByUser: null,
    dataMart: {
      id: 'dm-1',
      title: overrides.dataMartTitle ?? 'Marketing Mart',
    },
  };
}

function buildReportResponse(overrides: { id?: string; title?: string } = {}): ReportResponseDto {
  return {
    id: overrides.id ?? 'report-1',
    title: overrides.title ?? 'Daily Sales Report',
    dataMart: {
      id: 'dm-1',
      title: 'Marketing Mart',
      status: DataMartStatus.PUBLISHED,
      storage: buildDataStorageResponse(),
      definitionType: DataMartDefinitionType.SQL,
      definition: null,
      description: null,
      triggersCount: 0,
      reportsCount: 1,
      createdByUser: null,
      businessOwnerUsers: [],
      technicalOwnerUsers: [],
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      schema: null,
    },
    dataDestinationAccess: {
      id: 'dest-1',
      title: 'Email',
      type: DataDestinationType.EMAIL,
      projectId: 'project-1',
      credentials: {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: ['daily@example.com'],
      },
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    destinationConfig: {
      type: DestinationTypeConfigEnum.EMAIL_CONFIG,
      reportCondition: ReportConditionEnum.ALWAYS,
      subject: 'Daily Sales',
      templateSource: {
        type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
        config: {
          messageTemplate: 'Daily report',
        },
      },
    },
    columnConfig: null,
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    runsCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-01T00:00:00.000Z',
    createdByUser: null,
    ownerUsers: [],
    canRun: true,
    canManageTriggers: true,
    canEditConfig: true,
  };
}

function buildProjectReportTriggerWithoutReport(): ProjectScheduledTriggerResponseApiDto {
  return {
    ...buildProjectReportTrigger(),
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
      reportId: 'report-1',
    } as ProjectScheduledTriggerResponseApiDto['triggerConfig'],
  };
}

function buildProjectConnectorTriggerWithoutConfig(): ProjectScheduledTriggerResponseApiDto {
  return {
    ...buildProjectReportTrigger(),
    id: 'trigger-2',
    type: ScheduledTriggerType.CONNECTOR_RUN,
    triggerConfig: undefined as unknown as ProjectScheduledTriggerResponseApiDto['triggerConfig'],
  };
}

function buildProjectConnectorTrigger(): ProjectScheduledTriggerResponseApiDto {
  return {
    ...buildProjectConnectorTriggerWithoutConfig(),
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_CONNECTOR_RUN,
      connector: {
        connector: {
          source: {
            name: 'FacebookMarketing',
            configuration: [],
            node: 'ads',
            fields: ['campaign'],
          },
          storage: {
            fullyQualifiedName: 'dataset.table',
          },
        },
      },
    } as unknown as ProjectScheduledTriggerResponseApiDto['triggerConfig'],
  };
}

function buildDataStorageResponse(): ReportResponseDto['dataMart']['storage'] {
  return {
    id: 'storage-1',
    title: 'BigQuery Storage',
    type: DataStorageType.GOOGLE_BIGQUERY,
    credentials: null,
    config: {
      projectId: 'test-project',
      location: 'US',
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-01T00:00:00.000Z',
    publishedDataMartsCount: 1,
    draftDataMartsCount: 0,
  };
}
