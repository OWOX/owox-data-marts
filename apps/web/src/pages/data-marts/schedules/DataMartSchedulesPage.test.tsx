import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import toast from 'react-hot-toast';
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
import { loadCustomConnectors } from '../../../features/connectors/shared/utils';
import DataMartSchedulesPage from './DataMartSchedulesPage';

const scheduledTriggerServiceMock = vi.hoisted(() => ({
  getProjectScheduledTriggers: vi.fn(),
  updateScheduledTrigger: vi.fn(),
}));

const connectorApiServiceMock = vi.hoisted(() => ({
  getAvailableConnectors: vi.fn(),
}));

vi.mock('../../../features/data-marts/scheduled-triggers/services', () => ({
  scheduledTriggerService: scheduledTriggerServiceMock,
}));

vi.mock('../../../features/connectors/shared/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../features/connectors/shared/utils')>()),
  loadCustomConnectors: vi.fn(),
}));

vi.mock('../../../features/connectors/shared/api', () => ({
  ConnectorApiService: vi.fn(function () {
    return connectorApiServiceMock;
  }),
}));

vi.mock('../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerForm', () => ({
  ScheduledTriggerForm: ({
    initialData,
    onSubmit,
  }: {
    initialData?: { cronExpression: string };
    onSubmit: (data: unknown) => Promise<void>;
  }) => (
    <div>
      Trigger form {initialData?.cronExpression}
      <button
        onClick={() => {
          void onSubmit({ cronExpression: '0 9 * * *', timeZone: 'UTC', isActive: true });
        }}
      >
        Save form
      </button>
    </div>
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
    vi.mocked(loadCustomConnectors).mockResolvedValue([]);
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
    expect(scheduledTriggerService.getProjectScheduledTriggers).toHaveBeenCalledWith();
  });

  it('uses table pagination over the full triggers list', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: Array.from({ length: 16 }, (_, index) =>
        buildProjectReportTrigger({
          id: `trigger-${index + 1}`,
          reportId: `report-${index + 1}`,
          reportTitle: `Report ${index + 1}`,
        })
      ),
    });

    renderPage();

    expect(await screen.findByText('Report 1')).toBeInTheDocument();
    expect(screen.getByText('1–15 of 16 rows')).toBeInTheDocument();
    expect(screen.queryByText('Report 16')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(await screen.findByText('Report 16')).toBeInTheDocument();
    expect(screen.getByText('16–16 of 16 rows')).toBeInTheDocument();
  });

  it('shows Data Mart as the first table column', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(getColumnHeaderLabels().slice(0, 2)).toEqual(['Data Mart', 'Trigger Type']);
  });

  it('truncates the Data Mart title and reveals the full title via tooltip', async () => {
    const longDataMartTitle = 'Marketing Campaign Performance Data Mart With Long Title';
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger({ dataMartTitle: longDataMartTitle })],
    });

    renderPage();

    const dataMartLink = await screen.findByRole('link', { name: longDataMartTitle });
    expect(dataMartLink).toHaveClass('block', 'w-full', 'truncate');
    expect(dataMartLink).not.toHaveClass('whitespace-normal', 'break-words');
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

  it('opens the linked trigger with a copy link and drops the parameter on close', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger(), buildProjectReportTrigger({ id: 'trigger-2' })],
    });

    renderPage('/ui/project-1/data-marts/schedules?trigger=trigger-2');

    expect(await screen.findByTestId('projectTriggerEditSheet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link to this schedule' })).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('?trigger=trigger-2');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('keeps the sheet open while a save reloads the list', async () => {
    let finishReload: (value: { triggers: ProjectScheduledTriggerResponseApiDto[] }) => void = () =>
      undefined;
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers)
      .mockResolvedValueOnce({ triggers: [buildProjectReportTrigger()] })
      .mockReturnValueOnce(
        new Promise(resolve => {
          finishReload = resolve;
        })
      );
    scheduledTriggerServiceMock.updateScheduledTrigger.mockResolvedValue(undefined);

    renderPage('/ui/project-1/data-marts/schedules?trigger=trigger-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Save form' }));

    await waitFor(() => {
      expect(scheduledTriggerService.getProjectScheduledTriggers).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('projectTriggerEditSheet')).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('?trigger=trigger-1');

    finishReload({ triggers: [buildProjectReportTrigger()] });
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('writes the trigger to the URL when a row opens the sheet', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));

    expect(await screen.findByTestId('projectTriggerEditSheet')).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('?trigger=trigger-1');
  });

  it.each([
    ['an unknown trigger', 'trigger-gone', true],
    ['a trigger the member cannot edit', 'trigger-1', false],
  ])('shows a toast and drops the parameter for %s', async (_name, id, canEdit) => {
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('t');
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger({ canEdit })],
    });

    renderPage(`/ui/project-1/data-marts/schedules?trigger=${id}`);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'This schedule was deleted or is not available to you.',
        { id: 'trigger-not-found' }
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
    expect(screen.queryByTestId('projectTriggerEditSheet')).not.toBeInTheDocument();
    toastError.mockRestore();
  });

  it('waits while the triggers load before judging the linked trigger', async () => {
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('t');
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockReturnValueOnce(
      new Promise(() => undefined)
    );

    renderPage('/ui/project-1/data-marts/schedules?trigger=trigger-1');

    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?trigger=trigger-1');
    toastError.mockRestore();
  });

  it('opens the Google Sheets document from its own action without opening the edit sheet', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectSheetsReportTrigger()],
    });

    renderPage();

    const openDocumentLink = await screen.findByRole('link', {
      name: 'Open document: Daily Sales Report',
    });
    expect(openDocumentLink).toHaveAttribute(
      'href',
      'https://docs.google.com/spreadsheets/d/spreadsheet-1/edit#gid=123'
    );
    expect(openDocumentLink).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Daily Sales Report').closest('a')).toBeNull();

    fireEvent.click(openDocumentLink);

    expect(screen.queryByTestId('projectTriggerEditSheet')).not.toBeInTheDocument();
  });

  it('opens the report details card without opening the edit sheet', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectSheetsReportTrigger()],
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Report details' }));
    const openInSheetsButton = await screen.findByRole('button', { name: 'Open document' });
    expect(screen.queryByTestId('projectTriggerEditSheet')).not.toBeInTheDocument();

    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(openInSheetsButton);

    expect(openWindow).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/spreadsheet-1/edit#gid=123',
      '_blank',
      'noopener,noreferrer'
    );
    expect(screen.queryByTestId('projectTriggerEditSheet')).not.toBeInTheDocument();
    openWindow.mockRestore();
  });

  it('does not show the document action for reports without a Google Sheets document', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Daily Sales Report')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open document/ })).not.toBeInTheDocument();
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

  it('does not expose trigger edit or delete actions when the row cannot be managed', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectReportTrigger({ canEdit: false, canDelete: false })],
    });

    renderPage();

    fireEvent.click(await screen.findByText('Daily Sales Report'));

    expect(screen.queryByTestId('projectTriggerEditSheet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
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

  it('opens connector details without run stats or a storage button it cannot fill', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTrigger()],
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Connector details' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Facebook Marketing');
    expect(screen.queryByText('No runs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Storage' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('projectTriggerEditSheet')).not.toBeInTheDocument();
  });

  it('renders and searches project-wide Data Quality schedules', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectDataQualityTrigger()],
    });

    renderPage();

    expect(await screen.findByText('Data Quality Run')).toBeInTheDocument();
    expect(await screen.findByText('Data Quality checks')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'Data Quality' },
    });

    expect(screen.getByText('Data Quality checks')).toBeInTheDocument();
  });

  it('uses the connector type icon for project-wide connector trigger run targets', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTrigger()],
    });

    renderPage();

    const connectorIcon = await screen.findByRole('img', { name: 'icon' });
    expect(connectorIcon).toHaveAttribute('src', 'data:image/png;base64,facebook-logo');
  });

  it('shows the display name of a custom connector trigger', async () => {
    vi.mocked(loadCustomConnectors).mockResolvedValue([fiberyConnector()]);
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        buildProjectConnectorTrigger('fibery_api'),
        buildProjectReportTrigger({ id: 'trigger-2', reportTitle: 'Inventory Audit' }),
      ],
    });

    renderPage();

    const row = (await screen.findByText('Fibery (owox.fibery.io)')).closest('tr');
    expect(row?.querySelector('.lucide-plug')).not.toBeNull();
    expect(row?.querySelector('.lucide-database')).toBeNull();
    expect(loadCustomConnectors).toHaveBeenCalledWith(
      expect.objectContaining({ skipErrorToast: true, skipLoadingIndicator: true })
    );

    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'owox.fibery.io' },
    });

    expect(screen.getByText('Fibery (owox.fibery.io)')).toBeInTheDocument();
    expect(screen.queryByText('Inventory Audit')).not.toBeInTheDocument();
  });

  it('shows the logo of a custom connector trigger', async () => {
    vi.mocked(loadCustomConnectors).mockResolvedValue([fiberyConnector(FIBERY_LOGO)]);
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTrigger('fibery_api')],
    });

    renderPage();

    const row = (await screen.findByText('Fibery (owox.fibery.io)')).closest('tr');
    expect(row?.querySelector(`img[src="${FIBERY_LOGO}"]`)).not.toBeNull();
  });

  it('filters by the display name of a custom connector', async () => {
    vi.mocked(loadCustomConnectors).mockResolvedValue([fiberyConnector()]);
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        buildProjectConnectorTrigger('fibery_api'),
        buildProjectReportTrigger({ id: 'trigger-2', reportTitle: 'Inventory Audit' }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Fibery (owox.fibery.io)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const filters = within(await screen.findByRole('dialog'));
    const [fieldTrigger] = filters.getAllByRole('combobox');
    await pickOption(fieldTrigger, 'Run Target');
    const valueInput = filters.getAllByRole('combobox').at(-1);
    if (!valueInput) throw new Error('No value field');
    fireEvent.mouseDown(valueInput, { button: 0 });
    fireEvent.click(
      await within(document.body).findByRole('option', { name: 'Fibery (owox.fibery.io)' })
    );
    fireEvent.click(filters.getByRole('button', { name: 'Apply filters', hidden: true }));

    await waitFor(() => {
      expect(screen.queryByText('Inventory Audit')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Fibery (owox.fibery.io)')).toBeInTheDocument();
  });

  it('searches a custom connector trigger by the connector name', async () => {
    vi.mocked(loadCustomConnectors).mockResolvedValue([fiberyConnector()]);
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        buildProjectConnectorTrigger('fibery_api'),
        buildProjectReportTrigger({ id: 'trigger-2', reportTitle: 'Inventory Audit' }),
      ],
    });

    renderPage();

    expect(await screen.findByText('Fibery (owox.fibery.io)')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'fibery_api' },
    });

    expect(screen.getByText('Fibery (owox.fibery.io)')).toBeInTheDocument();
    expect(screen.queryByText('Inventory Audit')).not.toBeInTheDocument();
  });

  it('still lists triggers when custom connectors fail to load', async () => {
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('t');
    vi.mocked(loadCustomConnectors).mockRejectedValue(new Error('boom'));
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [buildProjectConnectorTrigger('fibery_api')],
    });

    renderPage();

    const row = (await screen.findByText('fibery_api')).closest('tr');
    expect(row?.querySelector('.lucide-database')).not.toBeNull();
    expect(loadCustomConnectors).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    toastError.mockRestore();
  });

  it('searches across the full loaded triggers list without fetching another page', async () => {
    vi.mocked(scheduledTriggerService.getProjectScheduledTriggers).mockResolvedValueOnce({
      triggers: [
        ...Array.from({ length: 15 }, (_, index) =>
          buildProjectReportTrigger({
            id: `trigger-${index + 1}`,
            reportId: `report-${index + 1}`,
            reportTitle: `Report ${index + 1}`,
          })
        ),
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
    expect(scheduledTriggerService.getProjectScheduledTriggers).toHaveBeenCalledTimes(1);
  });
});

function Search() {
  return <div data-testid='search'>{useLocation().search}</div>;
}

const FIBERY_LOGO = 'data:image/png;base64,AAAA';

function fiberyConnector(logoBase64: string | null = null) {
  return {
    name: 'fibery_api',
    displayName: 'Fibery (owox.fibery.io)',
    description: '',
    logoBase64,
    docUrl: null,
    isCustom: true,
  };
}

async function pickOption(trigger: HTMLElement, name: string) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(await within(document.body).findByRole('option', { name }));
}

function renderPage(path = '/ui/project-1/data-marts/schedules') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataMartSchedulesPage />
      <Search />
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
  overrides: {
    id?: string;
    reportId?: string;
    reportTitle?: string;
    dataMartTitle?: string;
    canEdit?: boolean;
    canDelete?: boolean;
  } = {}
): ProjectScheduledTriggerResponseApiDto {
  const reportId = overrides.reportId ?? 'report-1';

  const trigger = {
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
    canEdit: overrides.canEdit ?? true,
    canDelete: overrides.canDelete ?? true,
  };

  return trigger as ProjectScheduledTriggerResponseApiDto;
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

function buildProjectSheetsReportTrigger(): ProjectScheduledTriggerResponseApiDto {
  return {
    ...buildProjectReportTrigger(),
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
      reportId: 'report-1',
      report: {
        ...buildReportResponse(),
        dataDestinationAccess: {
          id: 'dest-sheets-1',
          title: 'Google Sheets',
          type: DataDestinationType.GOOGLE_SHEETS,
          projectId: 'project-1',
          credentials: {},
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        destinationConfig: {
          type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
          spreadsheetId: 'spreadsheet-1',
          sheetId: 123,
        },
      },
    } as unknown as ProjectScheduledTriggerResponseApiDto['triggerConfig'],
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

function buildProjectConnectorTrigger(
  sourceName = 'FacebookMarketing'
): ProjectScheduledTriggerResponseApiDto {
  return {
    ...buildProjectConnectorTriggerWithoutConfig(),
    triggerConfig: {
      type: TRIGGER_CONFIG_TYPES.SCHEDULED_CONNECTOR_RUN,
      connector: {
        connector: {
          source: {
            name: sourceName,
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

function buildProjectDataQualityTrigger(): ProjectScheduledTriggerResponseApiDto {
  return {
    ...buildProjectReportTrigger(),
    id: 'trigger-data-quality',
    type: ScheduledTriggerType.DATA_QUALITY_RUN,
    triggerConfig: null,
  };
}

function buildDataStorageResponse(): ReportResponseDto['dataMart']['storage'] {
  return {
    id: 'storage-1',
    title: 'BigQuery Storage',
    type: DataStorageType.GOOGLE_BIGQUERY,
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
