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
  dataMartStatus: 'PUBLISHED',
  dataMartLoaded: true,
}));

vi.mock('../../../../app/store/hooks', () => ({
  useFlags: () => ({ flags: {} }),
}));

vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: mocks.navigate }),
}));

vi.mock('../../../idp', () => ({
  useAuth: () => ({
    user: { projectId: 'project-1', mcpServerUrl: 'https://project-1.mcp.owox.com/mcp' },
  }),
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
    dataMart: mocks.dataMartLoaded
      ? {
          id: 'data-mart-1',
          title: 'Orders',
          canPublish: false,
          canActualizeSchema: false,
          status: {
            code: mocks.dataMartStatus,
            displayName: mocks.dataMartStatus,
            description: '',
          },
          definition: null,
          definitionType: 'SQL',
          validationErrors: [],
          storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
        }
      : null,
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
    mocks.dataMartStatus = 'PUBLISHED';
    mocks.dataMartLoaded = true;
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

  it('shows the setup promo for the freshly created draft and consumes only its state marker', async () => {
    mocks.dataMartStatus = 'DRAFT';
    renderDetails({ createdDataMartId: 'data-mart-1', other: 'keep' });

    expect(mocks.showPromo).toHaveBeenCalledExactlyOnceWith({
      step: 'SETUP_DATA',
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      mcpServerUrl: 'https://project-1.mcp.owox.com/mcp',
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('"state":{"other":"keep"}');
    });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '"search":"?preset=connector&connectorName=GoogleSheets"'
    );
    expect(screen.getByTestId('location')).toHaveTextContent('"hash":"#setup"');
  });

  it.each([undefined, { createdDataMartId: 'another-mart' }, { other: 'keep' }])(
    'does not show the draft promo on direct MCP, ordinary, or unrelated entry: %j',
    state => {
      mocks.dataMartStatus = 'DRAFT';
      renderDetails(state);
      expect(mocks.showPromo).not.toHaveBeenCalled();
    }
  );

  it('waits for the created draft to load before consuming the marker', async () => {
    mocks.dataMartStatus = 'DRAFT';
    mocks.dataMartLoaded = false;
    const view = renderDetails({ createdDataMartId: 'data-mart-1' });
    expect(mocks.showPromo).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('createdDataMartId');

    mocks.dataMartLoaded = true;
    view.rerender(detailsTree({ createdDataMartId: 'data-mart-1' }));
    await waitFor(() => {
      expect(mocks.showPromo).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the existing published promo when a creation marker is stale', () => {
    renderDetails({ createdDataMartId: 'data-mart-1' });
    expect(mocks.showPromo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        step: 'USE_DATA',
        showOnce: true,
      })
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid='location'>{JSON.stringify(location)}</div>;
}

function detailsTree(state?: Record<string, unknown>) {
  return (
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/data-marts/data-mart-1/data-setup',
          search: '?preset=connector&connectorName=GoogleSheets',
          hash: '#setup',
          state,
        },
      ]}
    >
      <DataMartDetails id='data-mart-1' />
      <LocationProbe />
    </MemoryRouter>
  );
}

function renderDetails(state?: Record<string, unknown>) {
  return render(detailsTree(state));
}
