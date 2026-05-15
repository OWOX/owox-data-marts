import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractApiError } from '../../../../../app/api';
import { trackEvent } from '../../../../../utils';
import { TaskStatus } from '../../../../../shared/types/task-status.enum';
import { dataMartService, DataMartMetadataScope } from '../../../shared';
import type {
  GenerateDataMartMetadataResponseDto,
  GeneratedFieldMetadataDto,
} from '../../../shared/types/api';

const DEFAULT_USE_SAMPLE = true;
const POLLING_INTERVAL_MS = 1000;
const FINAL_STATUSES: readonly TaskStatus[] = [
  TaskStatus.SUCCESS,
  TaskStatus.ERROR,
  TaskStatus.CANCELLED,
];

export interface UseAiHelperResult {
  /** Which scope is currently being generated, or null. */
  pendingScope: PendingScope | null;
  generateTitle: (dataMartId: string) => Promise<string | undefined>;
  generateDescription: (dataMartId: string) => Promise<string | undefined>;
  generateFieldAlias: (dataMartId: string, fieldName: string) => Promise<string | undefined>;
  generateFieldDescription: (dataMartId: string, fieldName: string) => Promise<string | undefined>;
  generateAllFieldDescriptions: (
    dataMartId: string
  ) => Promise<GeneratedFieldMetadataDto[] | undefined>;
  generateAllFieldAliases: (dataMartId: string) => Promise<GeneratedFieldMetadataDto[] | undefined>;
  generateAllFieldMetadata: (
    dataMartId: string
  ) => Promise<GeneratedFieldMetadataDto[] | undefined>;
}

export type PendingScope =
  | { scope: DataMartMetadataScope.TITLE }
  | { scope: DataMartMetadataScope.DESCRIPTION }
  | { scope: DataMartMetadataScope.FIELD_ALIAS; fieldName: string }
  | { scope: DataMartMetadataScope.FIELD_DESCRIPTION; fieldName: string }
  | { scope: DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS }
  | { scope: DataMartMetadataScope.ALL_FIELD_ALIASES }
  | { scope: DataMartMetadataScope.ALL_FIELD_METADATA };

function isFieldScopedPending(
  pending: PendingScope
): pending is Extract<
  PendingScope,
  { scope: DataMartMetadataScope.FIELD_ALIAS | DataMartMetadataScope.FIELD_DESCRIPTION }
> {
  return (
    pending.scope === DataMartMetadataScope.FIELD_ALIAS ||
    pending.scope === DataMartMetadataScope.FIELD_DESCRIPTION
  );
}

interface RunState {
  triggerId: string;
  dataMartId: string;
  abortController: AbortController;
}

/**
 * Sleep with cancellation support — resolves immediately if the signal aborts mid-wait
 * so the polling loop can react to user-initiated cancels without an extra delay.
 */
function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort);
  });
}

/**
 * Calls the AI helper backend endpoint and returns suggested metadata.
 *
 * Internally uses an asynchronous trigger + polling flow (POST creates a trigger,
 * status is polled every 1s, response is fetched when complete) to dodge the
 * ingress 30s idle timeout that previously killed long-running synchronous calls.
 * The public API is unchanged from the caller's perspective: each method still
 * returns either the suggestion or `undefined`.
 *
 * This hook does NOT persist suggestions — callers apply them via the
 * existing update endpoints (or push them into local schema state).
 */
export function useAiHelper(): UseAiHelperResult {
  const [pendingScope, setPendingScope] = useState<PendingScope | null>(null);
  const runStateRef = useRef<RunState | null>(null);

  // Best-effort cancel of any prior in-flight run (also DELETEs the trigger on the
  // backend so the scheduler stops processing it). Called when the user clicks AI again
  // before the previous run finishes, and on unmount.
  const cancelCurrentRun = useCallback((): void => {
    const state = runStateRef.current;
    if (!state) return;
    runStateRef.current = null;
    state.abortController.abort();
    dataMartService.abortAiHelperTrigger(state.dataMartId, state.triggerId).catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      cancelCurrentRun();
    };
  }, [cancelCurrentRun]);

  /**
   * Poll the trigger until it reaches a terminal status, then fetch the result.
   * Returns the AI response on SUCCESS, or `undefined` on ERROR/CANCELLED/abort —
   * intentionally swallowing trigger-level errors so callers see the same
   * "could not generate" UX as the legacy synchronous flow.
   */
  const pollTriggerStatus = useCallback(
    async (
      dataMartId: string,
      triggerId: string,
      signal: AbortSignal
    ): Promise<GenerateDataMartMetadataResponseDto | undefined> => {
      while (!signal.aborted) {
        let status: TaskStatus;
        try {
          status = await dataMartService.getAiHelperTriggerStatus(dataMartId, triggerId);
        } catch {
          return undefined;
        }

        if (FINAL_STATUSES.includes(status)) {
          if (status === TaskStatus.SUCCESS) {
            try {
              const response = await dataMartService.getAiHelperTriggerResponse(
                dataMartId,
                triggerId
              );
              return response.result;
            } catch {
              return undefined;
            }
          }
          // ERROR / CANCELLED — drain the response so the row is cleaned up backend-side,
          // but swallow the error: callers handle the "no suggestion" UX uniformly.
          dataMartService.getAiHelperTriggerResponse(dataMartId, triggerId).catch(() => undefined);
          return undefined;
        }

        await sleepWithSignal(POLLING_INTERVAL_MS, signal);
      }
      return undefined;
    },
    []
  );

  const generate = useCallback(
    async (
      dataMartId: string,
      pending: PendingScope
    ): Promise<GenerateDataMartMetadataResponseDto | undefined> => {
      // A new click while another run is in flight aborts the previous one.
      cancelCurrentRun();
      setPendingScope(pending);

      const fieldName = isFieldScopedPending(pending) ? pending.fieldName : undefined;
      let result: GenerateDataMartMetadataResponseDto | undefined;

      try {
        const { triggerId } = await dataMartService.createAiHelperTrigger(dataMartId, {
          scope: pending.scope,
          useSample: DEFAULT_USE_SAMPLE,
          fieldName,
        });

        const abortController = new AbortController();
        runStateRef.current = { triggerId, dataMartId, abortController };

        result = await pollTriggerStatus(dataMartId, triggerId, abortController.signal);

        // Only clear the ref if this run is still the current one; a parallel
        // `cancelCurrentRun` (e.g. a fast double-click) may have already replaced it.
        // The explicit cast widens TS's narrowed type after the await — the ref can
        // legitimately become null while we were polling.
        const currentRun = runStateRef.current as RunState | null;
        if (currentRun?.triggerId === triggerId) {
          runStateRef.current = null;
        }

        if (result !== undefined) {
          trackEvent({
            event: 'data_mart_ai_metadata_generated',
            category: 'DataMart',
            action: 'GenerateMetadata',
            label: pending.scope,
            context: dataMartId,
          });
        }
      } catch (error) {
        const apiError = extractApiError(error);
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'GenerateMetadataError',
          label: pending.scope,
          context: dataMartId,
          error: apiError.message,
        });
      } finally {
        setPendingScope(null);
      }

      return result;
    },
    [cancelCurrentRun, pollTriggerStatus]
  );

  const generateTitle = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, { scope: DataMartMetadataScope.TITLE });
      return result?.title?.trim();
    },
    [generate]
  );

  const generateDescription = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, { scope: DataMartMetadataScope.DESCRIPTION });
      return result?.description?.trim();
    },
    [generate]
  );

  const generateFieldAlias = useCallback(
    async (dataMartId: string, fieldName: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.FIELD_ALIAS,
        fieldName,
      });
      const match = result?.fields?.find(f => f.name === fieldName);
      const alias = match?.alias?.trim();
      if (!alias) {
        toast.error('AI returned no alias suggestion. Try again or fill it in manually.');
        return undefined;
      }
      return alias;
    },
    [generate]
  );

  const generateFieldDescription = useCallback(
    async (dataMartId: string, fieldName: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.FIELD_DESCRIPTION,
        fieldName,
      });
      const match = result?.fields?.find(f => f.name === fieldName);
      const description = match?.description?.trim();
      if (!description) {
        toast.error('AI returned no description suggestion. Try again or fill it in manually.');
        return undefined;
      }
      return description;
    },
    [generate]
  );

  const generateAllFieldDescriptions = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS,
      });
      const fields = result?.fields ?? [];
      if (fields.length === 0) {
        toast.error('AI returned no field descriptions. Try again or fill them in manually.');
        return undefined;
      }
      return fields;
    },
    [generate]
  );

  const generateAllFieldAliases = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_ALIASES,
      });
      const fields = result?.fields ?? [];
      if (fields.length === 0) {
        toast.error('AI returned no field aliases. Try again or fill them in manually.');
        return undefined;
      }
      return fields;
    },
    [generate]
  );

  const generateAllFieldMetadata = useCallback(
    async (dataMartId: string) => {
      const result = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_METADATA,
      });
      const fields = result?.fields ?? [];
      if (fields.length === 0) {
        toast.error('AI returned no field metadata. Try again or fill it in manually.');
        return undefined;
      }
      return fields;
    },
    [generate]
  );

  return {
    pendingScope,
    generateTitle,
    generateDescription,
    generateFieldAlias,
    generateFieldDescription,
    generateAllFieldDescriptions,
    generateAllFieldAliases,
    generateAllFieldMetadata,
  };
}
