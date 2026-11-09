import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectorApiService } from '../../../shared/api';
import { DataStorageType } from '../../../../data-storage';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { DataMartStatus } from '../../../../data-marts/shared/enums';
import { ConnectorConfigurationItem } from './ConnectorConfigurationItem';

vi.mock('../../../shared/model/hooks/useConnector', () => ({
  useConnector: () => ({
    connectors: [{ name: 'FacebookMarketing', displayName: 'Facebook Ads', logoBase64: null }],
    fetchAvailableConnectors: vi.fn(),
  }),
}));

vi.mock('../../../shared/utils', () => ({
  getConnectorInfoByName: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../idp', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../idp')>()),
  useCanEdit: () => true,
}));

// The edit sheet itself is out of scope: expose only whether it is open.
vi.mock('../../DataMartConnectorView', () => ({
  DataMartConnectorView: ({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) =>
    isOpen ? (
      <div role='dialog' aria-label='Edit sheet'>
        <button type='button' onClick={onClose}>
          Close sheet
        </button>
      </div>
    ) : null,
}));

const dataStorage = {
  id: 's1',
  title: 'BigQuery',
  type: DataStorageType.GOOGLE_BIGQUERY,
  config: { projectId: 'proj', location: 'US' },
  createdAt: new Date(),
  modifiedAt: new Date(),
} as DataStorage;

const connectorDef: ConnectorDefinitionConfig = {
  connector: {
    source: {
      name: 'FacebookMarketing',
      node: 'insights',
      configuration: [{}, {}],
      fields: ['id'],
    },
    storage: { fullyQualifiedName: 'raw.fb_insights' },
  },
};

const renderItem = (
  props: {
    totalConfigurations?: number;
    configIndex?: number;
    definition?: ConnectorDefinitionConfig;
  } = {}
) => {
  const onRemoveConfiguration = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectorConfigurationItem
        configIndex={props.configIndex ?? 1}
        connectorDef={props.definition ?? connectorDef}
        onRemoveConfiguration={onRemoveConfiguration}
        onUpdateConfiguration={() => vi.fn()}
        dataMartStatus={DataMartStatus.PUBLISHED}
        totalConfigurations={props.totalConfigurations ?? 2}
        dataStorage={dataStorage}
      />
    </QueryClientProvider>
  );
  return { onRemoveConfiguration };
};

describe('ConnectorConfigurationItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('links the Google Sheets sheet name to the tab it imports', async () => {
    const tabUrl = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=42';
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockResolvedValue([
      {
        value: 'Summary',
        label: 'Summary',
        url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0',
      },
      { value: 'Leads', label: 'Leads', url: tabUrl },
    ]);
    const sheets: ConnectorDefinitionConfig = {
      connector: {
        source: {
          name: 'GoogleSheets',
          node: 'sheet',
          configuration: [{ SpreadsheetId: 'abc', SheetName: 'Leads' }],
          fields: ['a'],
        },
        storage: { fullyQualifiedName: 'raw.leads' },
      },
    };

    renderItem({ definition: sheets, configIndex: 0, totalConfigurations: 1 });

    // The spreadsheet link shows first and is replaced once the tab list loads.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('href', tabUrl);
    });
  });

  it('sends a click made before the tab list loads to the tab, not to the first tab', async () => {
    const tabUrl = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=42';
    let resolveTabs: (value: { value: string; label: string; url: string }[]) => void = () =>
      undefined;
    vi.spyOn(ConnectorApiService.prototype, 'previewConnectorFieldOptions').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveTabs = resolve;
        })
    );
    const opened = {
      opener: {} as unknown,
      document: document.implementation.createHTMLDocument(''),
      location: { replace: vi.fn() },
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window);
    // jsdom does not navigate: record where the opened tab's own link leads.
    const followed: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      followed.push(this.href);
    });
    const sheets: ConnectorDefinitionConfig = {
      connector: {
        source: {
          name: 'GoogleSheets',
          node: 'sheet',
          configuration: [
            {
              SpreadsheetId: 'https://docs.google.com/spreadsheets/d/abc/edit?gid=7#gid=7',
              SheetName: 'Leads',
            },
          ],
          fields: ['a'],
        },
        storage: { fullyQualifiedName: 'raw.leads' },
      },
    };

    renderItem({ definition: sheets, configIndex: 0, totalConfigurations: 1 });
    const link = screen.getByRole('link', { name: 'Leads' });
    // While the list loads, the plain link is the spreadsheet without the pasted URL's gid.
    expect(link).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/abc/edit');
    fireEvent.click(link);

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(opened.opener).toBeNull();
    expect(opened.document.title).toBe('Opening Google Sheets…');
    resolveTabs([{ value: 'Leads', label: 'Leads', url: tabUrl }]);
    await waitFor(() => {
      expect(followed).toEqual([tabUrl]);
    });
  });

  it('shows the flow from the source to the storage', () => {
    renderItem();

    expect(screen.getByRole('article', { name: 'Configuration 2' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('Facebook Ads');
    expect(screen.getByRole('region', { name: 'Source' })).toHaveTextContent('insights');
    expect(screen.getByRole('region', { name: 'Storage' })).toHaveTextContent('Google BigQuery');
    expect(screen.getByRole('link', { name: 'fb_insights' })).toBeInTheDocument();
  });

  it('opens and closes the edit sheet from the Edit button', () => {
    renderItem();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration 2' }));
    expect(screen.getByRole('dialog', { name: 'Edit sheet' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes the configuration from the Delete button', () => {
    const { onRemoveConfiguration } = renderItem();

    // Delete renders twice, on the Source heading row (narrow) and in the right column (wide);
    // container queries hide one of them, which jsdom does not apply.
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete configuration 2' });
    expect(deleteButtons).toHaveLength(2);

    for (const button of deleteButtons) {
      fireEvent.click(button);
    }
    expect(onRemoveConfiguration).toHaveBeenCalledTimes(2);
    expect(onRemoveConfiguration).toHaveBeenCalledWith(1);
  });

  it('shows no Delete for the only configuration', () => {
    renderItem({ totalConfigurations: 1, configIndex: 0 });

    expect(screen.queryAllByRole('button', { name: /^Delete configuration/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Edit configuration 1' })).toBeInTheDocument();
  });

  it('shows the Source and Storage headings with their hints on the first configuration', () => {
    renderItem({ configIndex: 0 });

    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /extracts this data from the source/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /automatically created/ })).toBeInTheDocument();
  });

  it('leaves the headings out of later configurations', () => {
    renderItem({ configIndex: 1 });

    expect(screen.queryByText('Source')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
    // The blocks are still named for assistive tech.
    expect(screen.getByRole('region', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Storage' })).toBeInTheDocument();
  });
});
