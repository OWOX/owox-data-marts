import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { dataStorageApiService } from '../api';
import type { OwoxStorageUsageResponseDto } from '../api/types';

export function useOwoxStorageUsage(storageId: string) {
  const [usage, setUsage] = useState<OwoxStorageUsageResponseDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Keeps the usage on screen while it reloads; only a failed load clears it.
  // `fresh` skips the table list the backend caches for 60 s (the Refresh button).
  const load = useCallback(
    async (fresh = false) => {
      setFailed(false);
      setLoading(true);
      try {
        setUsage(await dataStorageApiService.getOwoxStorageUsage(storageId, fresh));
      } catch {
        setUsage(null);
        setFailed(true);
      } finally {
        setLoading(false);
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
      await load();
    } catch {
      // The default error toast has already reported it; keep the dialog open to retry.
    } finally {
      setDeleting(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      await dataStorageApiService.restoreOwoxStorage(storageId);
      toast.success('Storage restored.');
      await load();
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
