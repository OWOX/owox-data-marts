// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartDetails } from './DataMartDetails';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  showPromo: vi.fn(),
  dismissAllPromos: vi.fn(),
  registerSchemaGuard: vi.fn(),
  hasActiveRuns: false,
  qualitySummary: null as null | { state: string },
  mcpServerUrl: undefined as string | undefined,
  canEdit: true,
  dataMartId: 'data-mart-1',
  statusCode: 'PUBLISHED',
  dataMartLoaded: true,
}));

vi.mock('../../../../app/store/hooks', () => ({
  useFlags: () => ({ flags: {} }),
}));

vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: mocks.navigate }),
}));

vi.mock('../../../idp', () => ({
  useAuth: () => ({ user: { projectId: 'project-1', mcpServerUrl: mocks.mcpServerUrl } }),
  useRole: () => ({ canEdit: mocks.canEdit }),
}));

vi.mock('../hooks/useDataMartNextStepPromo', () => ({
  PromoStep: { SCHEDULE_DATA: 'SCHEDULE_DATA', USE_DATA: 'USE_DATA', SETUP_DATA: 'SETUP_DATA' },
  useDataMartNextStepPromo: () => ({
    showPromo: mocks.showPromo,
    dismissAllPromos: mocks.dismissAllPromos,
  }),
}));

vi.mock('../../data-quality/model/use-data-quality-workspace', () => ({
  useDataQualitySummary: () => ({ data: mocks.qualitySummary }),
}));

vi.mock('../../shared/hooks/useSchemaActualizeTrigger', () => ({
  useSchemaActualizeTrigger: () => ({ run: vi.fn(), isLoading: false }),
}));

vi.mock('../model', () => ({
  useAiHelper: () => ({ generateTitle: vi.fn(), pendingScope: null }),
  useAiHelperAvailability: () => ({ enabled: false }),
  useRefreshDataMartAfterConnectorRun: vi.fn(),
  useSchemaUnsavedGuard: () => ({
    registerSchemaGuard: mocks.registerSchemaGuard,
    runGuarded: vi.fn(),
    dialog: {
      open: false,
      intent: 'navigation',
      isSaving: false,
      onSaveAndContinue: vi.fn(),
      onDiscardAndContinue: vi.fn(),
      onCancel: vi.fn(),
    },
  }),
  useDataMart: () => ({
    dataMart: !mocks.dataMartLoaded
      ? null
      : {
          id: mocks.dataMartId,
          title: 'Orders',
          canPublish: false,
          canActualizeSchema: false,
          status: { code: mocks.statusCode, displayName: 'Published', description: '' },
          definition: null,
          definitionType: 'SQL',
          validationErrors: [],
          storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
        },
    deleteDataMart: vi.fn(),
    updateDataMartTitle: vi.fn(),
    updateDataMartDescription: vi.fn(),
    updateDataMartOwners: vi.fn(),
    updateDataMartDefinition: vi.fn(),
    actualizeDataMartSchema: vi.fn(),
    updateDataMartSchema: vi.fn(),
    publishDataMart: vi.fn(),
    runDataMart: vi.fn(),
    cancelDataMartRun: vi.fn(),
    getDataMartRuns: vi.fn(),
    loadMoreDataMartRuns: vi.fn(),
    isLoading: false,
    isLoadingMoreRuns: false,
    hasMoreRunsToLoad: false,
    hasActiveRuns: mocks.hasActiveRuns,
    error: null,
    getErrorMessage: vi.fn(),
    runs: [],
    getDataMart: vi.fn(),
    isManualRunTriggered: false,
    manualRunId: null,
    resetManualRunTriggered: vi.fn(),
  }),
}));

vi.mock('../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx', () => ({
  InlineEditTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView.tsx', () => ({
  ConnectorRunView: () => null,
}));

vi.mock('./SchemaUnsavedChangesDialog', () => ({
  SchemaUnsavedChangesDialog: () => null,
}));

describe('DataMartDetails navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasActiveRuns = false;
    mocks.qualitySummary = null;
    mocks.mcpServerUrl = undefined;
    mocks.statusCode = 'PUBLISHED';
    mocks.dataMartLoaded = true;
    mocks.dataMartId = 'data-mart-1';
  });

  it('labels the quality route as Data Quality', () => {
    renderDetails();

    expect(screen.getByRole('link', { name: 'Data Quality' })).toHaveAttribute('href', '/quality');
  });

  it.each(['QUEUED', 'RUNNING'])(
    'shows Data Quality activity while the latest run is %s',
    state => {
      mocks.qualitySummary = { state };

      renderDetails();

      expect(screen.getByRole('status')).toHaveTextContent('Checking data quality');
      expect(screen.getByRole('button', { name: 'View runs' })).toBeVisible();
    }
  );

  it('preserves the data-update activity label', () => {
    mocks.hasActiveRuns = true;

    renderDetails();

    expect(screen.getByRole('status')).toHaveTextContent('Updating data');
  });

  it('uses combined copy when data and Data Quality runs are active together', () => {
    mocks.hasActiveRuns = true;
    mocks.qualitySummary = { state: 'RUNNING' };

    renderDetails();

    expect(screen.getByRole('status')).toHaveTextContent('Runs in progress');
  });

  it('does not show run activity for a terminal Data Quality run', () => {
    mocks.qualitySummary = { state: 'PASSED' };

    renderDetails();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
  });

  it('opens Data Mart Run History from Data Quality activity', () => {
    mocks.qualitySummary = { state: 'RUNNING' };

    renderDetails();
    screen.getByRole('button', { name: 'View runs' }).click();

    expect(mocks.navigate).toHaveBeenCalledWith('/data-marts/data-mart-1/run-history');
  });
});

describe('DataMartDetails setup promo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasActiveRuns = false;
    mocks.qualitySummary = null;
    mocks.mcpServerUrl = 'https://mcp.example.com';
    mocks.canEdit = true;
    mocks.statusCode = 'DRAFT';
    mocks.dataMartLoaded = true;
    mocks.dataMartId = 'data-mart-1';
  });

  const setupCalls = () => mocks.showPromo.mock.calls.filter(([arg]) => arg.step === 'SETUP_DATA');

  it('shows the setup promo for the freshly created draft and consumes only its marker', async () => {
    renderDetails({ createdDataMartId: 'data-mart-1', other: 'keep' });

    expect(mocks.showPromo).toHaveBeenCalledExactlyOnceWith({
      step: 'SETUP_DATA',
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('"state":{"other":"keep"}');
    });
    expect(screen.getByTestId('location')).not.toHaveTextContent('createdDataMartId');
    expect(screen.getByTestId('location')).toHaveTextContent('"hash":"#setup"');
  });

  it.each(['?preset=sql', '?preset=blank', '?preset=SQL'])(
    'shows the setup toast when the preset opens no modal: %s',
    async search => {
      renderDetails({ createdDataMartId: 'data-mart-1' }, search);

      await waitFor(() => {
        expect(screen.getByTestId('location')).not.toHaveTextContent('createdDataMartId');
      });
      expect(setupCalls()).toHaveLength(1);
    }
  );

  it.each([
    '?preset=connector&connectorName=GoogleSheets',
    '?connectorName=GoogleSheets',
    '?preset=facebook',
    '?preset=connector',
    '?preset=Table',
  ])('skips the setup toast while a modal opens by itself: %s', async search => {
    renderDetails({ createdDataMartId: 'data-mart-1' }, search);

    await waitFor(() => {
      expect(screen.getByTestId('location')).not.toHaveTextContent('createdDataMartId');
    });
    expect(setupCalls()).toHaveLength(0);
    expect(screen.getByTestId('location')).toHaveTextContent(`"search":"${search}"`);
  });

  it('dismisses the promos when it moves to another Data Mart in place', () => {
    const view = renderDetails();
    mocks.dismissAllPromos.mockClear();
    mocks.dataMartId = 'data-mart-2';

    view.rerender(detailsTree(undefined, '', 'data-mart-2'));

    expect(mocks.dismissAllPromos).toHaveBeenCalledOnce();
  });

  it.each([undefined, { createdDataMartId: 'another-mart' }, { other: 'keep' }])(
    'does not show the setup promo on an ordinary or unrelated entry: %j',
    state => {
      renderDetails(state);

      expect(setupCalls()).toHaveLength(0);
    }
  );

  it('does not show the setup promo without an MCP server', () => {
    mocks.mcpServerUrl = undefined;

    renderDetails({ createdDataMartId: 'data-mart-1' });

    expect(setupCalls()).toHaveLength(0);
  });

  it('does not show the setup promo to a viewer', () => {
    mocks.canEdit = false;

    renderDetails({ createdDataMartId: 'data-mart-1' });

    expect(setupCalls()).toHaveLength(0);
  });

  it('waits for the created draft to load before consuming the marker', async () => {
    mocks.dataMartLoaded = false;
    const view = renderDetails({ createdDataMartId: 'data-mart-1' });
    expect(mocks.showPromo).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('createdDataMartId');

    mocks.dataMartLoaded = true;
    view.rerender(detailsTree({ createdDataMartId: 'data-mart-1' }));
    await waitFor(() => {
      expect(setupCalls()).toHaveLength(1);
    });
  });

  it('keeps the publication promo when a creation marker is stale on a published Data Mart', () => {
    mocks.statusCode = 'PUBLISHED';

    renderDetails({ createdDataMartId: 'data-mart-1' });

    expect(setupCalls()).toHaveLength(0);
    expect(mocks.showPromo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ step: 'USE_DATA', showOnce: true })
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid='location'>{JSON.stringify(location)}</div>;
}

function detailsTree(state?: Record<string, unknown>, search = '', id = 'data-mart-1') {
  return (
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/data-marts/data-mart-1/data-setup',
          search,
          hash: '#setup',
          state,
        },
      ]}
    >
      <DataMartDetails id={id} />
      <LocationProbe />
    </MemoryRouter>
  );
}

function renderDetails(state?: Record<string, unknown>, search = '') {
  return render(detailsTree(state, search));
}
