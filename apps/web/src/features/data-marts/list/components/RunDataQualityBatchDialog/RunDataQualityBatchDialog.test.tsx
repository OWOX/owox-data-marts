// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataQualityConfigResponse } from '../../../data-quality/model/types';
import type { DataMartListItem } from '../../model/types';
import { RunDataQualityBatchDialog } from './RunDataQualityBatchDialog';
import { dataQualityBatchApi } from './data-quality-batch.api';
import { dataQualityService } from '../../../data-quality/api/data-quality.service';

vi.mock('../../../data-quality/api/data-quality.service', () => ({
  dataQualityService: {
    getConfig: vi.fn(),
  },
}));

vi.mock('./data-quality-batch.api', () => ({
  dataQualityBatchApi: {
    run: vi.fn(),
  },
}));

describe('RunDataQualityBatchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows backend eligibility, runs only eligible items, and keeps partial results visible', async () => {
    vi.mocked(dataQualityService.getConfig)
      .mockResolvedValueOnce(buildConfigResponse(true))
      .mockResolvedValueOnce(buildConfigResponse(true))
      .mockResolvedValueOnce(buildConfigResponse(false, 'OUTPUT_SCHEMA_REQUIRED'));
    vi.mocked(dataQualityBatchApi.run).mockResolvedValue({
      items: [
        { dataMartId: 'mart-1', status: 'SUCCESS', runId: 'run-1' },
        {
          dataMartId: 'mart-2',
          status: 'ERROR',
          code: 'ACTIVE_RUN',
          message: 'A Data Quality run is already active',
          activeRunId: 'run-existing',
        },
      ],
    });
    const onCompleted = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={vi.fn()}
          dataMarts={[
            buildDataMart('mart-1', 'Orders'),
            buildDataMart('mart-2', 'Customers'),
            buildDataMart('mart-3', 'Draft'),
          ]}
          projectId='project-1'
          onCompleted={onCompleted}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(dataQualityService.getConfig).toHaveBeenCalledTimes(3);
    });
    expect(
      within(screen.getByTestId('quality-eligibility-mart-1')).getByText('Eligible')
    ).toBeVisible();
    expect(
      within(screen.getByTestId('quality-eligibility-mart-3')).getByText('Output Schema required')
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Run Quality for 2 Data Marts' }));

    await waitFor(() => {
      expect(dataQualityBatchApi.run).toHaveBeenCalledWith(['mart-1', 'mart-2']);
    });
    expect(await screen.findByText('Queued')).toBeVisible();
    expect(screen.getByText('A Data Quality run is already active')).toBeVisible();
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['data-quality', 'project-1', 'mart-1'],
    });
  });

  it('does not offer a run when every selected Data Mart is ineligible', async () => {
    vi.mocked(dataQualityService.getConfig).mockResolvedValue(
      buildConfigResponse(false, 'NO_APPLICABLE_CHECKS')
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={vi.fn()}
          dataMarts={[buildDataMart('mart-1', 'Orders')]}
          projectId='project-1'
          onCompleted={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(await screen.findByText('No applicable checks enabled')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run Quality' })).toBeDisabled();
    expect(dataQualityBatchApi.run).not.toHaveBeenCalled();
  });

  it('keeps successful enqueue results authoritative when the list refresh fails', async () => {
    vi.mocked(dataQualityService.getConfig).mockResolvedValue(buildConfigResponse(true));
    vi.mocked(dataQualityBatchApi.run).mockResolvedValue({
      items: [{ dataMartId: 'mart-1', status: 'SUCCESS', runId: 'run-1' }],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onCompleted = vi.fn().mockRejectedValue(new Error('Refresh failed'));

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={vi.fn()}
          dataMarts={[buildDataMart('mart-1', 'Orders')]}
          projectId='project-1'
          onCompleted={onCompleted}
        />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Run Quality for 1 Data Mart' }));

    expect(await screen.findByText('Queued')).toBeVisible();
    expect(screen.queryByText(/could not be created/i)).not.toBeInTheDocument();
    expect(screen.getByText('Close', { selector: 'button' })).toBeVisible();
  });

  it('caps eligibility requests instead of fanning out the whole selection', async () => {
    const resolvers: ((value: ReturnType<typeof buildConfigResponse>) => void)[] = [];
    vi.mocked(dataQualityService.getConfig).mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(resolve);
        })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const dataMarts = Array.from({ length: 12 }, (_, index) =>
      buildDataMart(`mart-${String(index + 1)}`, `Mart ${String(index + 1)}`)
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={vi.fn()}
          dataMarts={dataMarts}
          projectId='project-1'
          onCompleted={vi.fn()}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(dataQualityService.getConfig).toHaveBeenCalledTimes(8);
    });
    resolvers.splice(0).forEach(resolve => {
      resolve(buildConfigResponse(true));
    });
    await waitFor(() => {
      expect(dataQualityService.getConfig).toHaveBeenCalledTimes(12);
    });
    resolvers.splice(0).forEach(resolve => {
      resolve(buildConfigResponse(true));
    });
  });
});

function buildDataMart(id: string, title: string): DataMartListItem {
  return {
    id,
    title,
    status: {
      code: 'PUBLISHED',
      displayName: 'Published',
      description: 'Published Data Mart',
    },
    storageType: 'GOOGLE_BIGQUERY',
    triggersCount: 0,
    reportsCount: 0,
    createdByUser: null,
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
    modifiedAt: new Date('2026-07-15T12:00:00.000Z'),
    definitionType: 'SQL',
    connectorSourceName: null,
    businessOwnerUsers: [],
    technicalOwnerUsers: [],
    contexts: [],
    qualitySummary: {
      state: 'NEVER_RUN',
      enabledChecks: 1,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
      dataMartRunId: null,
      lastRunAt: null,
    },
  } as DataMartListItem;
}

function buildConfigResponse(
  eligible: boolean,
  code: DataQualityConfigResponse['runEligibility']['code'] = null
): DataQualityConfigResponse {
  return {
    savedConfig: null,
    effectiveConfig: { timezone: 'UTC', rules: [] },
    source: 'DEFAULT' as const,
    permissions: { canEdit: eligible, canRun: eligible },
    runEligibility: { eligible, code, activeRunId: null },
    availableChecks: [],
  };
}
