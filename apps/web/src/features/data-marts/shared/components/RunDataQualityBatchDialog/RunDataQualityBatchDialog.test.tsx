// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataQualityBatchApi } from './data-quality-batch.api';
import { RunDataQualityBatchDialog } from './RunDataQualityBatchDialog';

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
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['data-quality', 'project-1', 'summaries'],
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Data Quality checks queued for 2 of 3 Data Marts. 1 failed: A Data Quality run is already active'
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('describes canvas targets as every Data Mart shown by the current filters', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <RunDataQualityBatchDialog
          open
          onOpenChange={vi.fn()}
          dataMarts={[buildDataMart('mart-1', 'Orders'), buildDataMart('mart-2', 'Customers')]}
          projectId='project-1'
          onCompleted={vi.fn()}
          targetScope='canvas'
        />
      </QueryClientProvider>
    );

    expect(
      screen.getByText(
        'Run Data Quality checks for all 2 Data Marts shown by the current canvas filters?'
      )
    ).toBeVisible();
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
      await screen.findByText('Data Quality checks could not be started: Network failed')
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
    expect(toast.error).toHaveBeenCalledWith(
      'The Data Quality check was queued, but the Data Mart list could not be refreshed'
    );
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
      'Data Quality check could not be queued: No applicable checks enabled'
    );
  });

  it('submits every selected Data Mart in one uncapped request', async () => {
    const dataMarts = Array.from({ length: 201 }, (_, index) =>
      buildDataMart(`mart-${String(index + 1)}`, `Data Mart ${String(index + 1)}`)
    );
    vi.mocked(dataQualityBatchApi.run).mockImplementation(async dataMartIds => ({
      items: dataMartIds.map((dataMartId, index) => ({
        dataMartId,
        status: 'SUCCESS' as const,
        runId: `run-${String(index + 1)}`,
      })),
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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

    fireEvent.click(screen.getByRole('button', { name: 'Check Quality' }));

    await waitFor(() => {
      expect(dataQualityBatchApi.run).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(dataQualityBatchApi.run).mock.calls[0]?.[0]).toHaveLength(201);
    expect(toast.success).toHaveBeenCalledWith('Data Quality checks queued for 201 Data Marts');
  });
});

function buildDataMart(id: string, title: string) {
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
  };
}
