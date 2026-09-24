import { useCallback, useEffect, useRef, useState } from 'react';
import { extractApiError } from '../../../../../app/api';
import { trackEvent } from '../../../../../utils/data-layer';
import { dataMartService } from '../../../shared/services/data-mart.service';
import type { PreviewDataMartResponseDto } from '../../../shared/types/api';
import type { FilterRule, SortRule } from '../../../shared/types/output-config';

export const PREVIEW_DEFAULT_LIMIT = 10;
export const PREVIEW_MAX_LIMIT = 1000;

export interface PreviewRequest {
  limit: number;
  filters: FilterRule[];
  /** One ORDER BY column at a time, applied in the warehouse. */
  sort: SortRule | null;
}

export interface DataMartPreviewState {
  result: PreviewDataMartResponseDto | null;
  /** The request `result` answers — what the chips and the limit field show as applied. */
  appliedRequest: PreviewRequest | null;
  isLoading: boolean;
  error: string | null;
  run: (request: PreviewRequest) => Promise<void>;
  cancel: () => void;
}

function isCancellation(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'CanceledError' || name === 'AbortError';
}

function previewErrorMessage(error: unknown): string {
  const apiError = extractApiError(error);
  const detail = apiError.details?.errors?.find(e => e.message)?.message;
  if (detail) return detail;
  if (apiError.message) return apiError.message;
  return error instanceof Error ? error.message : 'Preview failed. Please try again.';
}

/**
 * Runs the Data Setup preview. Each `run` is a new warehouse query (reported to product analytics),
 * so nothing here re-runs on its own; a new `run` cancels the one still in flight.
 */
export function useDataMartPreview(dataMartId: string): DataMartPreviewState {
  const [result, setResult] = useState<PreviewDataMartResponseDto | null>(null);
  const [appliedRequest, setAppliedRequest] = useState<PreviewRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsLoading(false);
  }, []);

  // Leaving the page must not leave a warehouse query running for nobody.
  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    async (request: PreviewRequest) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      setError(null);
      try {
        const response = await dataMartService.previewDataMart(
          dataMartId,
          {
            limit: request.limit,
            ...(request.filters.length ? { filters: request.filters } : {}),
            ...(request.sort ? { sort: [request.sort] } : {}),
          },
          controller.signal
        );
        if (controllerRef.current !== controller) return;
        setResult(response);
        setAppliedRequest(request);
        trackEvent({
          event: 'data_mart_preview',
          category: 'DataMart',
          action: 'Preview',
          label: dataMartId,
          limit: request.limit,
          filterCount: request.filters.length,
          sortDirection: request.sort?.direction ?? null,
          rowCount: response.rowCount,
          truncated: response.truncated,
        });
      } catch (e) {
        if (controllerRef.current !== controller || isCancellation(e)) return;
        const message = previewErrorMessage(e);
        setError(message);
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'PreviewError',
          label: dataMartId,
          error: message,
        });
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [dataMartId]
  );

  return { result, appliedRequest, isLoading, error, run, cancel };
}
