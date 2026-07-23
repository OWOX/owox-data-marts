// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartDetails } from './DataMartDetails';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  showPromo: vi.fn(),
  dismissAllPromos: vi.fn(),
  registerSchemaGuard: vi.fn(),
  hasActiveRuns: false,
  latestQualityRun: null as null | { summary: { state: string } },
}));

vi.mock('../../../../app/store/hooks', () => ({
  useFlags: () => ({ flags: {} }),
}));

vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: mocks.navigate }),
}));

vi.mock('../../../idp', () => ({
  useAuth: () => ({ user: { projectId: 'project-1' } }),
}));

vi.mock('../hooks/useDataMartNextStepPromo', () => ({
  PromoStep: { SCHEDULE_DATA: 'SCHEDULE_DATA', USE_DATA: 'USE_DATA' },
  useDataMartNextStepPromo: () => ({
    showPromo: mocks.showPromo,
    dismissAllPromos: mocks.dismissAllPromos,
  }),
}));

vi.mock('../../data-quality/model/use-data-quality-workspace', () => ({
  useLatestDataQualityRun: () => ({ data: mocks.latestQualityRun }),
}));

vi.mock('../../shared/hooks/useSchemaActualizeTrigger', () => ({
  useSchemaActualizeTrigger: () => ({ run: vi.fn(), isLoading: false }),
}));

vi.mock('../model/hooks/use-manual-connector-run-completion', () => ({
  useManualConnectorRunCompletion: vi.fn(),
}));

vi.mock('../model', () => ({
  useAiHelper: () => ({ generateTitle: vi.fn(), pendingScope: null }),
  useAiHelperAvailability: () => ({ enabled: false }),
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
    dataMart: {
      id: 'data-mart-1',
      title: 'Orders',
      canPublish: false,
      canActualizeSchema: false,
      status: { code: 'PUBLISHED', displayName: 'Published', description: '' },
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
    getDataMartRunById: vi.fn(),
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
    mocks.latestQualityRun = null;
  });

  it('labels the quality route as Data Quality', () => {
    renderDetails();

    expect(screen.getByRole('link', { name: 'Data Quality' })).toHaveAttribute('href', '/quality');
    expect(screen.queryByRole('link', { name: 'Quality' })).not.toBeInTheDocument();
  });

  it.each(['QUEUED', 'RUNNING'])(
    'shows Data Quality activity while the latest run is %s',
    state => {
      mocks.latestQualityRun = { summary: { state } };

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
    mocks.latestQualityRun = { summary: { state: 'RUNNING' } };

    renderDetails();

    expect(screen.getByRole('status')).toHaveTextContent('Runs in progress');
    expect(screen.queryByText('Updating data')).not.toBeInTheDocument();
    expect(screen.queryByText('Checking data quality')).not.toBeInTheDocument();
  });

  it('does not show run activity for a terminal Data Quality run', () => {
    mocks.latestQualityRun = { summary: { state: 'PASSED' } };

    renderDetails();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
  });

  it('opens Data Mart Run History from Data Quality activity', () => {
    mocks.latestQualityRun = { summary: { state: 'RUNNING' } };

    renderDetails();
    screen.getByRole('button', { name: 'View runs' }).click();

    expect(mocks.navigate).toHaveBeenCalledWith('/data-marts/data-mart-1/run-history');
  });
});

function renderDetails() {
  return render(
    <MemoryRouter initialEntries={['/data-marts/data-mart-1/overview']}>
      <DataMartDetails id='data-mart-1' />
    </MemoryRouter>
  );
}
