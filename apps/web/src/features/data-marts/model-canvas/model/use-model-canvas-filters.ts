import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router';
import { storageService } from '../../../../services/localstorage.service';
import { useUrlParam } from '../../../../shared/hooks/useUrlParam';
import type { CanvasRelFilter, CanvasStatusFilter } from './graph/filter-canvas-data';

const STORAGE_LS_KEY_PREFIX = 'model-canvas-storage';

export function useModelCanvasFilters() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const storageLsKey = `${STORAGE_LS_KEY_PREFIX}:${projectId}`;

  const storage = useUrlParam('storage');
  const status = useUrlParam('status');
  const rel = useUrlParam('rel');
  const search = useUrlParam('search');

  const { value: storageValue, setParam: setStorageParam } = storage;

  useEffect(() => {
    if (storageValue) return;
    const saved = storageService.get(storageLsKey);
    if (saved) setStorageParam(saved);
  }, [storageValue, setStorageParam, storageLsKey]);

  const statusFilter: CanvasStatusFilter =
    status.value === 'draft' ? 'draft' : status.value === 'published' ? 'published' : 'all';
  const relFilter: CanvasRelFilter = rel.value === 'connected' ? 'connected' : 'all';

  const { setParam: setStatusParam, removeParam: removeStatusParam } = status;
  const { setParam: setRelParam, removeParam: removeRelParam } = rel;
  const { setParam: setSearchParam, removeParam: removeSearchParam } = search;

  // Stable across renders (react-router's setSearchParams churns, but useUrlParam
  // already isolates that) so effects can safely depend on these setters.
  const setStorageId = useCallback(
    (id: string) => {
      storageService.set(storageLsKey, id);
      setStorageParam(id);
    },
    [storageLsKey, setStorageParam]
  );
  const setStatus = useCallback(
    (next: CanvasStatusFilter) => {
      if (next === 'all') removeStatusParam();
      else setStatusParam(next);
    },
    [removeStatusParam, setStatusParam]
  );
  const setRel = useCallback(
    (next: CanvasRelFilter) => {
      if (next === 'all') removeRelParam();
      else setRelParam(next);
    },
    [removeRelParam, setRelParam]
  );
  const setSearchQuery = useCallback(
    (next: string) => {
      if (next) setSearchParam(next);
      else removeSearchParam();
    },
    [setSearchParam, removeSearchParam]
  );

  return {
    storageId: storage.value,
    setStorageId,
    status: statusFilter,
    setStatus,
    rel: relFilter,
    setRel,
    searchQuery: search.value ?? '',
    setSearchQuery,
  };
}
