// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataMartDetails } from './DataMartDetails';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  showPromo: vi.fn(),
  dismissAllPromos: vi.fn(),
  registerSchemaGuard: vi.fn(),
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
    hasActiveRuns: false,
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
  it('labels the quality route as Data Quality', () => {
    render(
      <MemoryRouter initialEntries={['/data-marts/data-mart-1/overview']}>
        <DataMartDetails id='data-mart-1' />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Data Quality' })).toHaveAttribute('href', '/quality');
    expect(screen.queryByRole('link', { name: 'Quality' })).not.toBeInTheDocument();
  });
});
