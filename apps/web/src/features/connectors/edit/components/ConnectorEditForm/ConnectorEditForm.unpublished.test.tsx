import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ConnectorEditForm } from './ConnectorEditForm';
import { ConnectorContextProvider } from '../../../shared/model/context';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit';

// --- API service mocks -------------------------------------------------------
const getAvailableConnectors = vi.fn();
const getConnectorSpecification = vi.fn();
const getConnectorFields = vi.fn();
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

const builderList = vi.fn();
const builderGetById = vi.fn();
vi.mock('../../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = builderList;
    getById = builderGetById;
  },
}));

const navigate = vi.fn();
vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate, scope: (p: string) => p }),
}));

const DRAFT_ID = 'cdef-draft';
const DRAFT_NAME = 'MyDraftApi';

function renderForm({ configurationOnly }: { configurationOnly: boolean }) {
  const onSubmit = vi.fn<(c: ConnectorConfig) => void>();
  render(
    <MemoryRouter>
      <ConnectorContextProvider>
        <ConnectorEditForm
          onSubmit={onSubmit}
          dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
          configurationOnly={configurationOnly}
          initialStep={configurationOnly ? 1 : undefined}
          preselectedConnector={DRAFT_NAME}
        />
      </ConnectorContextProvider>
    </MemoryRouter>
  );
  return onSubmit;
}

describe('ConnectorEditForm — preselecting a never-published custom connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAvailableConnectors.mockResolvedValue([]);
    getConnectorSpecification.mockResolvedValue([]);
    getConnectorFields.mockResolvedValue([]);
    // The backend serves PUBLISHED manifests only, so both of these 404 for a
    // connector that has never been published.
    getCustomConnectorSpecification.mockRejectedValue(
      new Error(`No published version for connector '${DRAFT_NAME}'`)
    );
    getCustomConnectorFields.mockRejectedValue(
      new Error(`No published version for connector '${DRAFT_NAME}'`)
    );
    builderList.mockResolvedValue([
      {
        id: DRAFT_ID,
        name: DRAFT_NAME,
        title: 'My Draft Api',
        description: null,
        logo: null,
        docUrl: null,
        // Never published: no active version.
        activeVersionId: null,
        activeVersion: null,
      },
    ]);
    builderGetById.mockResolvedValue(undefined);
  });

  it('explains the connector is unpublished instead of leaving the step blank', async () => {
    renderForm({ configurationOnly: true });

    expect(await screen.findByText(/Not published yet/i)).toBeInTheDocument();
  });

  it('never requests the specification for an unpublished connector', async () => {
    renderForm({ configurationOnly: true });

    await screen.findByText(/Not published yet/i);
    expect(getCustomConnectorSpecification).not.toHaveBeenCalled();
    expect(getConnectorSpecification).not.toHaveBeenCalled();
  });

  it('never requests the fields for an unpublished connector in the full flow', async () => {
    renderForm({ configurationOnly: false });

    await screen.findByText(/Not published yet/i);
    expect(getCustomConnectorFields).not.toHaveBeenCalled();
    expect(getConnectorFields).not.toHaveBeenCalled();
  });

  it('offers a way into the builder to publish it', async () => {
    renderForm({ configurationOnly: true });

    fireEvent.click(await screen.findByRole('button', { name: /open in builder/i }));

    expect(navigate).toHaveBeenCalledWith(`/connectors/builder/${DRAFT_ID}`);
  });

  it('keeps the wizard from advancing past an unpublished connector', async () => {
    renderForm({ configurationOnly: true });

    await screen.findByText(/Not published yet/i);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save|finish|next/i })).toBeDisabled();
    });
  });
});
