import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelCanvas } from './use-model-canvas';

const serviceMocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  getEdges: vi.fn(),
  getSummaries: vi.fn(),
  getDataMartById: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ projectId: 'project-1' }),
}));

vi.mock('../api/model-canvas.service', () => ({
  modelCanvasService: serviceMocks,
}));

vi.mock('../../shared/services/data-mart.service', () => ({
  dataMartService: {
    getDataMartById: serviceMocks.getDataMartById,
  },
}));

vi.mock('../../data-quality/api/data-quality.service', () => ({
  dataQualityService: {
    getSummaries: serviceMocks.getSummaries,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useModelCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getEdges.mockResolvedValue([]);
    serviceMocks.getDataMartById.mockResolvedValue({
      definitionType: 'VIEW',
      schema: { fields: [] },
    });
  });

  it('passes the query abort signal through both requests', async () => {
    serviceMocks.getDataMarts.mockResolvedValue([]);
    serviceMocks.getSummaries.mockResolvedValue({});

    const { result } = renderHook(() => useModelCanvas('storage-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const nodeConfig = serviceMocks.getDataMarts.mock.calls[0]?.[1];
    const edgeConfig = serviceMocks.getEdges.mock.calls[0]?.[1];
    expect(nodeConfig?.signal).toBeInstanceOf(AbortSignal);
    expect(edgeConfig?.signal).toBe(nodeConfig?.signal);
    expect(nodeConfig).toMatchObject({
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
    expect(edgeConfig).toMatchObject({
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
  });

  it('aborts the inactive request when the selected storage changes', async () => {
    let firstSignal: AbortSignal | undefined;
    serviceMocks.getDataMarts
      .mockImplementationOnce((_storageId: string, config: { signal?: AbortSignal }) => {
        firstSignal = config.signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce([]);
    serviceMocks.getSummaries.mockResolvedValue({});

    const { rerender } = renderHook(({ storageId }) => useModelCanvas(storageId), {
      initialProps: { storageId: 'storage-1' },
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(1);
    });
    rerender({ storageId: 'storage-2' });

    await waitFor(() => {
      expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(2);
    });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('enriches topology details and leaves Data Quality summaries to the visible-node consumer', async () => {
    serviceMocks.getDataMarts.mockResolvedValue([canvasNode()]);
    serviceMocks.getSummaries.mockResolvedValue({
      'mart-1': qualitySummary('RUNNING'),
    });

    const { result } = renderHook(() => useModelCanvas('storage-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.nodes[0]?.fields).toEqual([]);
    });
    expect(result.current.data).toEqual({
      nodes: [{ ...canvasNode(), definitionType: 'VIEW', fields: [] }],
      edges: [],
    });
    expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(1);
    expect(serviceMocks.getEdges).toHaveBeenCalledTimes(1);
    expect(serviceMocks.getDataMartById).toHaveBeenCalledTimes(1);
    expect(serviceMocks.getSummaries).not.toHaveBeenCalled();
  });
});

function canvasNode() {
  return {
    id: 'mart-1',
    title: 'Orders',
    status: 'PUBLISHED',
    description: null,
    fieldCount: 3,
  };
}

function qualitySummary(state: 'RUNNING' | 'PASSED') {
  return {
    state,
    enabledChecks: 1,
    totalChecks: 1,
    passedChecks: state === 'PASSED' ? 1 : 0,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
    dataMartRunId: 'run-1',
    lastRunAt: '2026-07-16T10:00:00.000Z',
  };
}
