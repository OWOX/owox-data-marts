import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { dataStorageApiService } from '../api';
import type { OwoxStorageUsageResponseDto } from '../api/types';
import { invalidateDataStorageHealthStatus } from '../services/data-storage-health-status.service';

export function useOwoxStorageUsage(storageId: string) {
  const [usage, setUsage] = useState<OwoxStorageUsageResponseDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const latestLoad = useRef(0);

  // Keeps the usage on screen while it reloads; only a failed load clears it.
  // `fresh` skips the table list the backend caches for 60 s (the Refresh button).
  const load = useCallback(
    async (fresh = false) => {
      // Only the latest load sets the state: an older answer can hold a table that was deleted since.
      const request = ++latestLoad.current;
      setFailed(false);
      setLoading(true);
      try {
        const next = await dataStorageApiService.getOwoxStorageUsage(storageId, fresh);
        if (request === latestLoad.current) setUsage(next);
      } catch {
        if (request === latestLoad.current) {
          setUsage(null);
          setFailed(true);
        }
      } finally {
        if (request === latestLoad.current) setLoading(false);
      }
    },
    [storageId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!tableToDelete) return;
    setDeleting(true);
    try {
      await dataStorageApiService.deleteOwoxStorageTable(storageId, tableToDelete);
      setTableToDelete(null);
      // Fresh: another backend server can still cache the deleted table.
      await load(true);
    } catch (error) {
      // The default error toast has already reported it. A table that is already gone (another tab)
      // leaves the list; other errors keep the dialog open to retry.
      if (isAxiosError(error) && error.response?.status === 404) {
        setTableToDelete(null);
        await load(true);
      }
    } finally {
      setDeleting(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      await dataStorageApiService.restoreOwoxStorage(storageId);
      toast.success('Storage restored.');
      // The Data Mart storage card and the table picker still hold the health of the deleted storage.
      invalidateDataStorageHealthStatus(storageId);
      await load(true);
    } catch {
      // The default error toast has already reported it.
    } finally {
      setRestoring(false);
    }
  };

  return {
    usage,
    failed,
    loading,
    load,
    tableToDelete,
    setTableToDelete,
    deleting,
    confirmDelete,
    restoring,
    restore,
  };
}
