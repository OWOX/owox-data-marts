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
import { useModelCanvasFilters } from '../model/use-model-canvas-filters';
import { ModelCanvasToolbar } from './ModelCanvasToolbar';
import { dataQualityService } from '../../data-quality/api/data-quality.service';

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

function ModelCanvasViewContent() {
  const { dataStorages, loading: loadingStorages, fetchDataStorages } = useDataStorage();
  const [storageLoadError, setStorageLoadError] = useState<unknown>(null);
  const [storageLoadPending, setStorageLoadPending] = useState(true);
  const storageLoadGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const filters = useModelCanvasFilters();
  const { navigate, scope } = useProjectRoute();
  const storageKnown =
    Boolean(filters.storageId) && dataStorages.some(s => s.id === filters.storageId);
  const { data, isLoading, error, refetch } = useModelCanvas(
    storageKnown ? filters.storageId : null
  );

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

  const filtered = useMemo(
    () => (data ? filterCanvasData(data, filters.status, filters.rel) : null),
    [data, filters.status, filters.rel]
  );
  const renderEdges = useMemo(
    () => (filtered ? mergeBidirectionalEdges(filtered.edges) : []),
    [filtered]
  );

  const canvasStyle = { height: 'calc(100vh - 220px)', minHeight: 480 };

  const runQuality = useCallback(
    async (dataMartId: string) => {
      try {
        const config = await dataQualityService.getConfig(dataMartId);
        if (!config.permissions.canRun) {
          const reason = config.runEligibility.code
            ? QUALITY_ELIGIBILITY_MESSAGES[config.runEligibility.code]
            : undefined;
          toast.error(reason ?? 'This Data Mart is not eligible for a Quality run');
          return;
        }
        await dataQualityService.startRun(dataMartId);
        toast.success('Data Quality run queued');
        await refetch();
      } catch (caught) {
        toast.error(extractApiError(caught).message ?? 'Failed to start Data Quality run');
      }
    },
    [refetch]
  );

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
      ) : !data || data.nodes.length === 0 ? (
        <CanvasMessage>No data marts in this storage</CanvasMessage>
      ) : !filtered || filtered.nodes.length === 0 ? (
        <CanvasMessage>No data marts match the current filters</CanvasMessage>
      ) : (
        <Suspense fallback={<SkeletonList />}>
          <ModelCanvas
            nodes={filtered.nodes}
            edges={renderEdges}
            searchQuery={filters.searchQuery}
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
            style={canvasStyle}
          />
        </Suspense>
      )}
    </div>
  );
}

const QUALITY_ELIGIBILITY_MESSAGES: Record<string, string> = {
  NOT_PUBLISHED: 'Publish this Data Mart before running Quality',
  OUTPUT_SCHEMA_REQUIRED: 'Output Schema is required before running Quality',
  DEFINITION_REQUIRED: 'A data definition is required before running Quality',
  NO_APPLICABLE_CHECKS: 'Enable at least one applicable Quality check',
  ACTIVE_RUN: 'A Data Quality run is already active',
};

export function ModelCanvasView() {
  return (
    <DataStorageProvider>
      <ModelCanvasViewContent />
    </DataStorageProvider>
  );
}
