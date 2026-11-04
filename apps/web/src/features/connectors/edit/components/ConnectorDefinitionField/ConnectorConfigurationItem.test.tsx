import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const renderItem = (props: { totalConfigurations?: number; configIndex?: number } = {}) => {
  const onRemoveConfiguration = vi.fn();
  render(
    <ConnectorConfigurationItem
      configIndex={props.configIndex ?? 1}
      connectorDef={connectorDef}
      onRemoveConfiguration={onRemoveConfiguration}
      onUpdateConfiguration={() => vi.fn()}
      dataMartStatus={DataMartStatus.PUBLISHED}
      totalConfigurations={props.totalConfigurations ?? 2}
      dataStorage={dataStorage}
    />
  );
  return { onRemoveConfiguration };
};

describe('ConnectorConfigurationItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
