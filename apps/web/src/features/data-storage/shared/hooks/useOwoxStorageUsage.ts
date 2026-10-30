import { useCallback, useEffect, useState } from 'react';
import { dataStorageApiService } from '../api';
import type { OwoxStorageUsageResponseDto } from '../api/types';

export function useOwoxStorageUsage(storageId: string) {
  const [usage, setUsage] = useState<OwoxStorageUsageResponseDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setUsage(await dataStorageApiService.getOwoxStorageUsage(storageId));
    } catch {
      setUsage(null);
      setFailed(true);
    }
  }, [storageId]);

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

  return { usage, failed, load, tableToDelete, setTableToDelete, deleting, confirmDelete };
}
