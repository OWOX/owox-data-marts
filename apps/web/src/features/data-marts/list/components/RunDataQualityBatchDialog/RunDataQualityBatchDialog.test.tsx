// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataQualityService } from '../../../data-quality/api/data-quality.service';
import type { DataQualityConfigResponse } from '../../../data-quality/model/types';
import type { DataMartListItem } from '../../model/types';
import { dataQualityBatchApi } from './data-quality-batch.api';
import { RunDataQualityBatchDialog } from './RunDataQualityBatchDialog';

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

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('RunDataQualityBatchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataQualityService.getConfig).mockResolvedValue(buildConfigResponse());
  });

  it('confirms the selected count and submits every selected Data Mart without preflight', async () => {
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
        { dataMartId: 'mart-3', status: 'SUCCESS', runId: 'run-3' },
      ],
    });
    const onOpenChange = vi.fn();
    const onCompleted = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={onOpenChange}
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

    expect(screen.getByRole('heading', { name: 'Check Data Quality' })).toBeVisible();
    expect(screen.getByText('Run Data Quality checks for 3 selected Data Marts?')).toBeVisible();
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    expect(screen.queryByText('Eligible')).not.toBeInTheDocument();
    expect(dataQualityService.getConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Check Quality' }));

    await waitFor(() => {
      expect(dataQualityBatchApi.run).toHaveBeenCalledWith(['mart-1', 'mart-2', 'mart-3']);
    });
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['data-quality', 'project-1', 'mart-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['data-quality', 'project-1', 'mart-3'],
    });
    expect(toast.error).toHaveBeenCalledWith('Data Quality checks queued for 2 of 3 Data Marts');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the confirmation open when the batch request fails', async () => {
    vi.mocked(dataQualityBatchApi.run).mockRejectedValue(new Error('Network failed'));
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={onOpenChange}
          dataMarts={[buildDataMart('mart-1', 'Orders')]}
          projectId='project-1'
          onCompleted={vi.fn()}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check Quality' }));

    expect(
      await screen.findByText('Data Quality checks could not be started. Please try again.')
    ).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Check Quality' })).toBeEnabled();
  });

  it('keeps successful enqueue results authoritative when the list refresh fails', async () => {
    vi.mocked(dataQualityBatchApi.run).mockResolvedValue({
      items: [{ dataMartId: 'mart-1', status: 'SUCCESS', runId: 'run-1' }],
    });
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onCompleted = vi.fn().mockRejectedValue(new Error('Refresh failed'));

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={onOpenChange}
          dataMarts={[buildDataMart('mart-1', 'Orders')]}
          projectId='project-1'
          onCompleted={onCompleted}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check Quality' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toast.success).toHaveBeenCalledWith('Data Quality check queued for 1 Data Mart');
    expect(screen.queryByText(/could not be started/i)).not.toBeInTheDocument();
  });

  it('reports when none of the selected Data Marts can be queued', async () => {
    vi.mocked(dataQualityBatchApi.run).mockResolvedValue({
      items: [
        {
          dataMartId: 'mart-1',
          status: 'ERROR',
          code: 'NOT_ELIGIBLE',
          message: 'No applicable checks enabled',
        },
      ],
    });
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={onOpenChange}
          dataMarts={[buildDataMart('mart-1', 'Orders')]}
          projectId='project-1'
          onCompleted={vi.fn()}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check Quality' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Data Quality check could not be queued for the selected Data Mart'
    );
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

function buildConfigResponse(): DataQualityConfigResponse {
  return {
    savedConfig: null,
    effectiveConfig: { timezone: 'UTC', rules: [] },
    source: 'DEFAULT',
    permissions: { canEdit: true, canRun: true },
    runEligibility: { eligible: true, code: null, activeRunId: null },
    availableChecks: [],
    relationships: [],
  };
}
