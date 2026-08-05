import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { extractApiError } from '../../../../app/api';
import { Button } from '../../../../shared/components/Button';
import { DataStorageProvider } from '../../../data-storage/shared/model/context';
import { useDataStorage } from '../../../data-storage/shared/model/hooks/useDataStorage';
import { useProjectRoute } from '../../../../shared/hooks';
import { filterCanvasData } from '../model/graph/filter-canvas-data';
import { mergeBidirectionalEdges } from '../model/graph/merge-bidirectional-edges';
import { useModelCanvas } from '../model/use-model-canvas';
import { useRefreshDataLastUpdated } from '../model/use-refresh-data-last-updated';
import { useModelCanvasFilters } from '../model/use-model-canvas-filters';
import { ModelCanvasToolbar } from './ModelCanvasToolbar';
import { dataQualityService } from '../../data-quality/api/data-quality.service';
import { dataMartService } from '../../shared';
import {
  DataMartBulkActions,
  type DataMartCanvasExportFormat,
} from '../../shared/components/DataMartBulkActions';
import type { ModelCanvasExportHandle } from '../export';
import { trackEvent } from '../../../../utils/data-layer';
import { isDataQualityActivityState } from '../../shared/components/RunActivityIndicator';
import { useDataQualitySummaries } from '../../data-quality/model/use-data-quality-workspace';
import type { ModelCanvasData } from '../model/types';

const ModelCanvas = lazy(() => import('./ModelCanvas'));

function CanvasMessage({
  children,
  role = 'status',
}: {
  children: React.ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className='text-muted-foreground flex h-[480px] items-center justify-center rounded-lg border text-sm'
    >
      {children}
    </div>
  );
}

function extractErrorMessage(error: unknown): string | undefined {
  const apiError = extractApiError(error) as ReturnType<typeof extractApiError> | undefined;
  return apiError?.message;
}

interface ModelCanvasViewProps {
  onActiveQualityRunChange?: (active: boolean) => void;
}

function ModelCanvasViewContent({ onActiveQualityRunChange }: ModelCanvasViewProps) {
  const { dataStorages, loading: loadingStorages, fetchDataStorages } = useDataStorage();
  const [storageLoadError, setStorageLoadError] = useState<unknown>(null);
  const [storageLoadPending, setStorageLoadPending] = useState(true);
  const storageLoadGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const filters = useModelCanvasFilters();
  const { navigate, scope, projectId } = useProjectRoute();
  const storageKnown =
    Boolean(filters.storageId) && dataStorages.some(s => s.id === filters.storageId);
  const {
    data: topology,
    isLoading: isTopologyLoading,
    error: topologyError,
    refetch,
  } = useModelCanvas(storageKnown ? filters.storageId : null);
  const { refresh: refreshDataLastUpdated, isRefreshing: isRefreshingDataLastUpdated } =
    useRefreshDataLastUpdated(storageKnown ? filters.storageId : null);

  const loadDataStorages = useCallback(async () => {
    const generation = ++storageLoadGenerationRef.current;
    setStorageLoadError(null);
    setStorageLoadPending(true);
    try {
      await fetchDataStorages();
    } catch (error) {
      if (mountedRef.current && generation === storageLoadGenerationRef.current) {
        setStorageLoadError(error);
      }
    } finally {
      if (mountedRef.current && generation === storageLoadGenerationRef.current) {
        setStorageLoadPending(false);
      }
    }
  }, [fetchDataStorages]);

  useEffect(() => {
    mountedRef.current = true;
    void loadDataStorages();
    return () => {
      mountedRef.current = false;
      storageLoadGenerationRef.current += 1;
    };
  }, [loadDataStorages]);

  const filteredTopology = useMemo(
    () => (topology ? filterCanvasData(topology, filters.status, filters.rel) : null),
    [filters.rel, filters.status, topology]
  );
  const visibleDataMartIds = useMemo(
    () => filteredTopology?.nodes.map(node => node.id) ?? [],
    [filteredTopology]
  );
  const qualitySummariesQuery = useDataQualitySummaries(projectId ?? '', visibleDataMartIds);
  const {
    data: qualitySummaries,
    isLoading: areQualitySummariesLoading,
    error: qualitySummariesError,
    refetch: refetchQuality,
  } = qualitySummariesQuery;
  const hasActiveQualityRun = Object.values(qualitySummaries ?? {}).some(summary =>
    isDataQualityActivityState(summary?.state)
  );
  const filtered = useMemo<ModelCanvasData | null>(() => {
    if (!filteredTopology) return null;
    if (filteredTopology.nodes.length > 0 && !qualitySummaries) return null;

    const nodes = filteredTopology.nodes.flatMap(node => {
      const qualitySummary = qualitySummaries?.[node.id];
      return qualitySummary ? [{ ...node, qualitySummary }] : [];
    });
    const nodeIds = new Set(nodes.map(node => node.id));

    return {
      nodes,
      edges: filteredTopology.edges.filter(
        edge => nodeIds.has(edge.sourceDataMartId) && nodeIds.has(edge.targetDataMartId)
      ),
    };
  }, [filteredTopology, qualitySummaries]);

  useEffect(() => {
    onActiveQualityRunChange?.(hasActiveQualityRun);
  }, [hasActiveQualityRun, onActiveQualityRunChange]);

  const renderEdges = useMemo(
    () => (filtered ? mergeBidirectionalEdges(filtered.edges) : []),
    [filtered]
  );
  const selectedStorageType = dataStorages.find(storage => storage.id === filters.storageId)?.type;
  const bulkActionDataMarts = useMemo(
    () =>
      (filtered?.nodes ?? []).map(node => ({
        id: node.id,
        status: node.status,
        storageType: selectedStorageType,
      })),
    [filtered, selectedStorageType]
  );

  const canvasStyle = { height: 'calc(100vh - 220px)', minHeight: 480 };

  const canvasExportRef = useRef<ModelCanvasExportHandle>(null);
  // Image capture can take seconds on a large model — swallow repeat clicks
  // instead of kicking off parallel captures and duplicate downloads.
  const isExportingRef = useRef(false);
  const handleExport = useCallback((format: DataMartCanvasExportFormat) => {
    if (isExportingRef.current) return;
    isExportingRef.current = true;
    void (async () => {
      try {
        // The handle registers once the lazy canvas chunk mounts, and the
        // export itself declines until the first layout pass — in both windows
        // nothing downloads, so say so instead of silently succeeding, and
        // record analytics only for real downloads.
        const exported = (await canvasExportRef.current?.exportCanvas(format)) ?? false;
        if (!exported) {
          toast('The canvas is still loading — please try again in a moment.');
          return;
        }
        trackEvent({
          event: 'model_canvas_exported',
          category: 'DataMart',
          action: 'CanvasExport',
          label: format,
        });
      } catch (caught) {
        console.error('Canvas export failed:', caught);
        toast.error("Couldn't export the model — please try again.");
      } finally {
        isExportingRef.current = false;
      }
    })();
  }, []);

  const runQuality = useCallback(
    async (dataMartId: string) => {
      try {
        await dataQualityService.startRun(dataMartId);
        toast.success('Data Quality run queued');
        await refetchQuality();
      } catch (caught) {
        toast.error(extractErrorMessage(caught) ?? 'Failed to start Data Quality run');
      }
    },
    [refetchQuality]
  );

  const deleteDataMart = useCallback(async (dataMartId: string) => {
    try {
      await dataMartService.deleteDataMart(dataMartId);
      trackEvent({
        event: 'data_mart_deleted',
        category: 'DataMart',
        action: 'Delete',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete data mart';
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'DeleteError',
        label: message,
      });
      throw error;
    }
  }, []);

  const publishDataMart = useCallback(async (dataMartId: string) => {
    try {
      await dataMartService.publishDataMart(dataMartId);
      await dataMartService.createSchemaActualizeTrigger(dataMartId);
      trackEvent({
        event: 'data_mart_published',
        category: 'DataMart',
        action: 'Publish',
        context: dataMartId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish data mart';
      trackEvent({
        event: 'data_mart_error',
        category: 'DataMart',
        action: 'PublishError',
        label: message,
      });
      throw error;
    }
  }, []);

  const refreshCanvas = useCallback(async () => {
    await Promise.allSettled([refetch(), refetchQuality()]);
  }, [refetch, refetchQuality]);

  const isLoading =
    isTopologyLoading || (visibleDataMartIds.length > 0 && areQualitySummariesLoading);
  const error = topologyError ?? qualitySummariesError;

  return (
    <div className='dm-card p-4'>
      <ModelCanvasToolbar
        storages={dataStorages}
        storageId={filters.storageId}
        onStorageChange={filters.setStorageId}
        status={filters.status}
        onStatusChange={filters.setStatus}
        rel={filters.rel}
        onRelChange={filters.setRel}
        searchQuery={filters.searchQuery}
        onSearchChange={filters.setSearchQuery}
        actions={
          <DataMartBulkActions
            onExport={handleExport}
            onCheckDataLastUpdated={() => {
              // Meeting decision: the check covers what the user actually sees — the same
              // filtered set the other bulk actions target.
              void refreshDataLastUpdated(bulkActionDataMarts.map(dataMart => dataMart.id));
            }}
            isCheckingDataLastUpdated={isRefreshingDataLastUpdated}
            dataMarts={bulkActionDataMarts}
            projectId={projectId ?? ''}
            deleteDataMart={deleteDataMart}
            publishDataMart={publishDataMart}
            onCompleted={refreshCanvas}
            targetScope='canvas'
          />
        }
      />
      {storageLoadError ? (
        <CanvasMessage role='alert'>
          <div className='flex flex-col items-center gap-3'>
            <span>{extractErrorMessage(storageLoadError) ?? 'Failed to load storages'}</span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              aria-label='Retry loading storages'
              onClick={() => {
                void loadDataStorages();
              }}
            >
              Retry
            </Button>
          </div>
        </CanvasMessage>
      ) : loadingStorages || storageLoadPending || isLoading ? (
        <SkeletonList />
      ) : dataStorages.length === 0 ? (
        <CanvasMessage>No storages available</CanvasMessage>
      ) : !filters.storageId || !storageKnown ? (
        <CanvasMessage>Select a storage to view its data model</CanvasMessage>
      ) : error ? (
        <CanvasMessage role='alert'>
          {extractErrorMessage(error) ?? 'Failed to load the data model'}
        </CanvasMessage>
      ) : !topology || topology.nodes.length === 0 ? (
        <CanvasMessage>No data marts in this storage</CanvasMessage>
      ) : !filteredTopology || filteredTopology.nodes.length === 0 ? (
        <CanvasMessage>No data marts match the current filters</CanvasMessage>
      ) : !filtered ? (
        <SkeletonList />
      ) : (
        <Suspense fallback={<SkeletonList />}>
          <ModelCanvas
            nodes={filtered.nodes}
            edges={renderEdges}
            searchQuery={filters.searchQuery}
            storageId={filters.storageId}
            onOpenDataMart={dataMartId => {
              window.open(
                scope(`/data-marts/${dataMartId}/data-setup`),
                '_blank',
                'noopener,noreferrer'
              );
            }}
            onOpenQuality={dataMartId => {
              navigate(`/data-marts/${dataMartId}/quality`);
            }}
            onRunQuality={runQuality}
            isCheckingDataLastUpdated={isRefreshingDataLastUpdated}
            storageTitle={dataStorages.find(storage => storage.id === filters.storageId)?.title}
            exportApiRef={canvasExportRef}
            style={canvasStyle}
          />
        </Suspense>
      )}
    </div>
  );
}

export function ModelCanvasView({ onActiveQualityRunChange }: ModelCanvasViewProps) {
  return (
    <DataStorageProvider>
      <ModelCanvasViewContent onActiveQualityRunChange={onActiveQualityRunChange} />
    </DataStorageProvider>
  );
}
