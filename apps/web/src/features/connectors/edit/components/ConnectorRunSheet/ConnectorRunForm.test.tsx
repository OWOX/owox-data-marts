import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorApiService } from '../../../shared/api';
import { ConnectorBuilderApiService } from '../../../../connector-builder/shared/api/connector-builder-api.service';
import { ConnectorContextProvider } from '../../../shared/model/context';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit';
import type { ConnectorListItem } from '../../../shared/model/types/connector';
import { ConnectorRunForm } from './ConnectorRunForm';

vi.mock('../../../../data-marts/edit/model', () => ({
  useDataMartContext: () => ({ dataMart: null }),
}));

const CUSTOM_INFO: ConnectorListItem = {
  name: 'MyCustom',
  displayName: 'My Custom',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
  id: 'custom-1',
  // The connector's ACTIVE version, which is what getConnectorInfoByName snapshots.
  version: 3,
};

const definition = (
  sourceVersion: number | undefined,
  info: ConnectorListItem | null
): ConnectorDefinitionConfig => ({
  connector: {
    source: {
      name: 'MyCustom',
      configuration: [{ _id: 'config-1' }],
      node: 'orders',
      fields: ['id'],
      version: sourceVersion,
    },
    storage: { fullyQualifiedName: 'project.dataset' },
    info,
  },
});

const renderRunForm = (configuration: ConnectorDefinitionConfig) =>
  render(
    <ConnectorContextProvider>
      <ConnectorRunForm configuration={configuration} />
    </ConnectorContextProvider>
  );

describe('ConnectorRunForm specification loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the specification of the pinned version, not the active one', async () => {
    const specificationSpy = vi
      .spyOn(ConnectorApiService.prototype, 'getCustomConnectorSpecification')
      .mockResolvedValue([{ name: 'StartDate', attributes: ['MANUAL_BACKFILL'] }]);

    renderRunForm(definition(1, CUSTOM_INFO));

    await waitFor(() => {
      expect(specificationSpy).toHaveBeenCalledWith('custom-1', 1);
    });
    expect(specificationSpy).not.toHaveBeenCalledWith('custom-1', 3);
  });

  it('follows the active version when the Data Mart pins nothing', async () => {
    const specificationSpy = vi
      .spyOn(ConnectorApiService.prototype, 'getCustomConnectorSpecification')
      .mockResolvedValue([{ name: 'StartDate', attributes: ['MANUAL_BACKFILL'] }]);

    renderRunForm(definition(undefined, CUSTOM_INFO));

    await waitFor(() => {
      expect(specificationSpy).toHaveBeenCalledWith('custom-1', 3);
    });
  });

  it('re-resolves a custom connector whose info failed to load with the Data Mart', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'getAvailableConnectors').mockResolvedValue([]);
    vi.spyOn(ConnectorBuilderApiService.prototype, 'list').mockResolvedValue([
      {
        id: 'custom-1',
        name: 'MyCustom',
        title: 'My Custom',
        description: null,
        logo: null,
        docUrl: null,
        activeVersionId: 'version-3',
        activeVersion: 3,
      },
    ]);
    const bundledSpy = vi.spyOn(ConnectorApiService.prototype, 'getConnectorSpecification');
    const customSpy = vi
      .spyOn(ConnectorApiService.prototype, 'getCustomConnectorSpecification')
      .mockResolvedValue([{ name: 'StartDate', attributes: ['MANUAL_BACKFILL'] }]);

    renderRunForm(definition(1, null));

    await waitFor(() => {
      expect(customSpy).toHaveBeenCalledWith('custom-1', 1);
    });
    // A name-only fallback would have gone to the bundled endpoint and 404'd, leaving
    // the sheet permanently unrunnable.
    expect(bundledSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('No connector specification found')).toBeNull();
  });
});
