import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ConnectorEditForm } from './ConnectorEditForm';
import { ConnectorContextProvider } from '../../../shared/model/context';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit';

// --- API service mocks -------------------------------------------------------
// Bundled connector endpoints (name-keyed). Left empty for this scenario: the
// preselected name only exists among CUSTOM connectors, so the bundled list
// must never satisfy the preselect (that's the bug being fixed).
const getAvailableConnectors = vi.fn();
const getConnectorSpecification = vi.fn();
const getConnectorFields = vi.fn();
// Custom connector endpoints (id + version keyed)
const getCustomConnectorSpecification = vi.fn();
const getCustomConnectorFields = vi.fn();

vi.mock('../../../shared/api/connector-api.service', () => ({
  ConnectorApiService: class {
    getAvailableConnectors = getAvailableConnectors;
    getConnectorSpecification = getConnectorSpecification;
    getConnectorFields = getConnectorFields;
    getCustomConnectorSpecification = getCustomConnectorSpecification;
    getCustomConnectorFields = getCustomConnectorFields;
  },
}));

// Builder API: ConnectorEditForm loads custom connectors via .list().
const builderList = vi.fn();
const builderGetById = vi.fn();
vi.mock('../../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = builderList;
    getById = builderGetById;
  },
}));

// useProjectRoute pulls in auth (project id) state. Stub it to avoid wiring
// the auth provider; the router itself is provided via MemoryRouter.
vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate: vi.fn(), scope: (p: string) => p }),
}));

const CUSTOM_ID = 'cdef-1';
const CUSTOM_NAME = 'MyCustomApi';
const CUSTOM_ACTIVE_VERSION = 2;

const customSpec = [{ name: 'Token', title: 'API Token', required: true }];

const customFields = [
  {
    name: 'items',
    overview: 'Items',
    destinationName: 'items',
    uniqueKeys: ['id'],
    defaultFields: ['id', 'title'],
    fields: [
      { name: 'id', type: 'string' },
      { name: 'title', type: 'string' },
    ],
  },
];

function renderForm(onSubmit: (c: ConnectorConfig) => void) {
  return render(
    <MemoryRouter>
      <ConnectorContextProvider>
        <ConnectorEditForm
          onSubmit={onSubmit}
          dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
          configurationOnly
          initialStep={1}
          preselectedConnector={CUSTOM_NAME}
        />
      </ConnectorContextProvider>
    </MemoryRouter>
  );
}

describe('ConnectorEditForm — preselect matches custom connectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Bundled list is empty on purpose: the preselected name only exists
    // among custom connectors, so the preselect effect must fall back to
    // `allConnectors` (bundled + custom) rather than only bundled `connectors`.
    getAvailableConnectors.mockResolvedValue([]);
    getConnectorSpecification.mockResolvedValue([]);
    getConnectorFields.mockResolvedValue([]);
    getCustomConnectorSpecification.mockResolvedValue(customSpec);
    getCustomConnectorFields.mockResolvedValue(customFields);
    builderList.mockResolvedValue([
      {
        id: CUSTOM_ID,
        name: CUSTOM_NAME,
        title: CUSTOM_NAME,
        description: null,
        logo: null,
        docUrl: null,
        activeVersionId: 'v-2',
        activeVersion: CUSTOM_ACTIVE_VERSION,
      },
    ]);
    builderGetById.mockResolvedValue(undefined);
  });

  it('preselects a CUSTOM connector by name and loads its Configuration step', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // The preselect effect should resolve the custom connector once
    // builderList() populates `allConnectors`, fetch its spec via the
    // CUSTOM (id + version) endpoint, and render the Configuration step
    // for it — without ever requiring the bundled `connectors` list.
    await waitFor(() => {
      expect(getCustomConnectorSpecification).toHaveBeenCalledWith(
        CUSTOM_ID,
        CUSTOM_ACTIVE_VERSION
      );
    });

    // The Configuration step for the custom connector's spec is visible.
    const tokenInput = await screen.findByLabelText(/API Token/i);
    expect(tokenInput).toBeInTheDocument();

    // Never routed through the bundled (name-keyed) spec endpoint.
    expect(getConnectorSpecification).not.toHaveBeenCalledWith(CUSTOM_NAME);
  });
});
