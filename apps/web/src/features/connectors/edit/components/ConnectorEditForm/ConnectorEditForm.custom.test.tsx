import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ConnectorEditForm } from './ConnectorEditForm';
import { ConnectorContextProvider } from '../../../shared/model/context';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit';

// --- API service mocks -------------------------------------------------------
// Bundled connector endpoints (name-keyed)
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

// Builder API: ConnectorEditForm loads custom connectors via .list(); the
// version-picker popover (rendered inside ConnectorVersionControl) fetches the
// full version list via .getById() only when opened.
const builderList = vi.fn();
const builderGetById = vi.fn();
vi.mock('../../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = builderList;
    getById = builderGetById;
  },
}));

// useProjectRoute pulls in auth (project id) state. `navigate` is used by the
// form's "create new" button (never clicked here) and `scope` by the
// InviteTeammatesCard rendered on the selection step. Stub it to avoid wiring
// the auth provider; the router itself is provided via MemoryRouter.
vi.mock('../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate: vi.fn(), scope: (p: string) => p }),
}));

const CUSTOM_ID = 'cdef-1';
const CUSTOM_NAME = 'MyCustomApi';
const CUSTOM_ACTIVE_VERSION = 2;

const customSpec = [
  // A single required string parameter so the Configuration step is gated on it.
  { name: 'Token', title: 'API Token', required: true },
];

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
        <ConnectorEditForm onSubmit={onSubmit} dataStorageType={DataStorageType.GOOGLE_BIGQUERY} />
      </ConnectorContextProvider>
    </MemoryRouter>
  );
}

describe('ConnectorEditForm — custom connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The bundled list must be non-empty so the form's init effect settles
    // (an empty list re-triggers fetchAvailableConnectors and keeps loading=true,
    // leaving the selection step in its loading skeleton). The bundled connector
    // is irrelevant to this flow — we only ever select the custom card.
    getAvailableConnectors.mockResolvedValue([
      { name: 'bundledA', title: 'Bundled A', description: null, logo: null, docUrl: null },
    ]);
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
    builderGetById.mockResolvedValue({
      id: CUSTOM_ID,
      name: CUSTOM_NAME,
      title: CUSTOM_NAME,
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: 'v-2',
      versions: [
        { version: 1, status: 'published', publishedAt: '2026-01-01' },
        { version: 2, status: 'published', publishedAt: '2026-02-01' },
      ],
    });
  });

  it('routes spec/fields to the CUSTOM endpoints and follows active by default', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // The custom connector card appears once builderList() resolves.
    const card = await screen.findByText(CUSTOM_NAME);
    fireEvent.click(card);

    // --- Behavior 1: routing to custom endpoints ---
    await waitFor(() => {
      expect(getCustomConnectorSpecification).toHaveBeenCalledWith(
        CUSTOM_ID,
        CUSTOM_ACTIVE_VERSION
      );
    });
    expect(getCustomConnectorFields).toHaveBeenCalledWith(CUSTOM_ID, CUSTOM_ACTIVE_VERSION);
    // The bundled (name-keyed) spec/fields endpoints must NOT be used for the
    // custom connector — only ever for the empty bundled list (the name
    // 'MyCustomApi' must never be passed to the bundled methods).
    expect(getConnectorSpecification).not.toHaveBeenCalledWith(CUSTOM_NAME);
    expect(getConnectorFields).not.toHaveBeenCalledWith(CUSTOM_NAME);

    // Step 1 -> 2 (Configuration). Next is enabled once a connector is selected.
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Fill the single required parameter so configuration becomes valid.
    const tokenInput = await screen.findByLabelText(/API Token/i);
    fireEvent.change(tokenInput, { target: { value: 'secret-token' } });

    // Step 2 -> 3 (Select Nodes).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Pick the 'items' node (radio).
    const nodeRadio = await screen.findByRole('radio', { name: /items/i });
    fireEvent.click(nodeRadio);

    // Step 3 -> 4 (Select Fields).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Default/unique-key fields auto-select, so Next is enabled; advance to Target.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Step 5 (Target Setup) — BigQuery auto-fills dataset + table, which are valid.
    const saveButton = await screen.findByRole('button', { name: /save/i });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

    // --- Behavior 2: follows active by default (no explicit pin) ---
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0][0] as ConnectorConfig;
    expect(payload.source.name).toBe(CUSTOM_NAME);
    expect(payload.source.version).toBeUndefined();
    expect(payload.source.node).toBe('items');
  });

  it('pins a specific published version via the version control and carries it on save', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    const card = await screen.findByText(CUSTOM_NAME);
    fireEvent.click(card);

    // Next is briefly disabled while the Step 2 spec/fields fetch for the
    // custom connector is in flight; wait for it to settle before advancing
    // (same wait idiom the later step transitions below use, applied here too).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Default badge: following active (v2) — no pin yet.
    const badge = await screen.findByTestId('connector-version-badge');
    expect(badge).toHaveTextContent('Following active · v2');

    // Open the popover and pin version 1.
    fireEvent.click(badge);
    fireEvent.click(await screen.findByRole('button', { name: 'Pin to version 1' }));

    // Pinning must re-resolve the Step 2 schema for the newly pinned version.
    await waitFor(() => {
      expect(getCustomConnectorSpecification).toHaveBeenCalledWith(CUSTOM_ID, 1);
    });
    expect(getCustomConnectorFields).toHaveBeenCalledWith(CUSTOM_ID, 1);

    // Fill the required parameter and finish the wizard.
    const tokenInput = await screen.findByLabelText(/API Token/i);
    fireEvent.change(tokenInput, { target: { value: 'secret-token' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const nodeRadio = await screen.findByRole('radio', { name: /items/i });
    fireEvent.click(nodeRadio);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const saveButton = await screen.findByRole('button', { name: /save/i });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0][0] as ConnectorConfig;
    expect(payload.source.version).toBe(1);
  });
});
