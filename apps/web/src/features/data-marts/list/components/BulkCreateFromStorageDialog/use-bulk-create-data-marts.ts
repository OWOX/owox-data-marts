import { useCallback, useState } from 'react';
import type { StorageResourceLeafDto } from '../../../../data-storage/shared/api/types';
import { dataMartService } from '../../../shared';
import { trackEvent } from '../../../../../utils/data-layer';
import { deriveDefinition, extractDataMartTitle } from './bulk-create.utils';

export interface BulkCreateFailure {
  fullyQualifiedName: string;
  title: string;
  message: string;
}

export interface BulkCreateResult {
  successCount: number;
  failures: BulkCreateFailure[];
  successfulFqns: string[];
}

interface RunArgs {
  storageId: string;
  leaves: StorageResourceLeafDto[];
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Failed to create data mart';
}

/**
 * Sequentially creates one data mart per resource leaf and immediately sets its definition.
 * Failures are captured per-item; successfully created marts remain even if a later item fails
 * (matches the resilient pattern used by batch publish).
 */
export function useBulkCreateDataMarts() {
  const [inFlight, setInFlight] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const run = useCallback(async ({ storageId, leaves }: RunArgs): Promise<BulkCreateResult> => {
    setInFlight(true);
    setProgress({ done: 0, total: leaves.length });

    const failures: BulkCreateFailure[] = [];
    const successfulFqns: string[] = [];

    try {
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const title = extractDataMartTitle(leaf);
        try {
          const created = await dataMartService.createDataMart({ title, storageId });
          await dataMartService.updateDataMartDefinition(created.id, deriveDefinition(leaf));
          successfulFqns.push(leaf.fullyQualifiedName);
          trackEvent({
            event: 'data_mart_created',
            category: 'DataMart',
            action: 'BulkCreateFromStorage',
            label: leaf.type,
            context: created.id,
          });
        } catch (error) {
          console.error(`Bulk create failed for resource ${leaf.fullyQualifiedName}:`, error);
          failures.push({
            fullyQualifiedName: leaf.fullyQualifiedName,
            title,
            message: extractErrorMessage(error),
          });
        } finally {
          setProgress({ done: i + 1, total: leaves.length });
        }
      }

      return {
        successCount: successfulFqns.length,
        failures,
        successfulFqns,
      };
    } finally {
      setInFlight(false);
    }
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
  }, []);

  return { run, inFlight, progress, reset };
}
