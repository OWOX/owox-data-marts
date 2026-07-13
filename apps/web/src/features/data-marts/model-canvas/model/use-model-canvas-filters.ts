import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
    status.value === 'draft' ? 'draft' : status.value === 'all' ? 'all' : 'published';
  const relFilter: CanvasRelFilter = rel.value === 'all' ? 'all' : 'connected';

  return {
    storageId: storage.value,
    setStorageId: (id: string) => {
      storageService.set(storageLsKey, id);
      setStorageParam(id);
    },
    status: statusFilter,
    setStatus: (next: CanvasStatusFilter) => {
      if (next === 'published') status.removeParam();
      else status.setParam(next);
    },
    rel: relFilter,
    setRel: (next: CanvasRelFilter) => {
      if (next === 'connected') rel.removeParam();
      else rel.setParam(next);
    },
    searchQuery: search.value ?? '',
    setSearchQuery: (next: string) => {
      if (next) search.setParam(next);
      else search.removeParam();
    },
  };
}
