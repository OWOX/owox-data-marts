import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractApiError, type ApiError } from '../../../../../app/api';
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

type GenerateOutcome =
  | { kind: 'ok'; data: GenerateDataMartMetadataResponseDto }
  | { kind: 'failed' }
  | { kind: 'cancelled' };

/**
 * Trigger ERROR wraps `{ error: '…' }` inside a `BadRequestException`, so the real
 * message lives at `data.error`. Other 4xx/5xx use `data.message`.
 */
function extractPollErrorMessage(error: unknown): string | undefined {
  const response = (
    error as { response?: { status?: number; data?: { error?: string; message?: string } } }
  ).response;
  if (!response) return undefined;
  const data = response.data ?? {};
  if (response.status === 400 && data.error) return data.error;
  return data.message ?? data.error;
}

/**
 * Hook for AI metadata generation using triggers.
 * Per-scope methods return the suggestion (or `undefined`); `pendingScope` lets the
 * UI render a per-scope spinner while a generation is in flight.
 */
export function useAiHelper(): UseAiHelperResult {
  const [pendingScope, setPendingScope] = useState<PendingScope | null>(null);
  const runStateRef = useRef<RunState | null>(null);

  const isCurrentRun = useCallback((triggerId: string): boolean => {
    return runStateRef.current?.triggerId === triggerId;
  }, []);

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

  const pollTriggerStatus = useCallback(
    async (
      dataMartId: string,
      triggerId: string,
      signal: AbortSignal
    ): Promise<GenerateOutcome> => {
      while (!signal.aborted && isCurrentRun(triggerId)) {
        try {
          const status = await dataMartService.getAiHelperTriggerStatus(dataMartId, triggerId);

          if (FINAL_STATUSES.includes(status)) {
            let outcome: GenerateOutcome;
            if (status === TaskStatus.CANCELLED) {
              dataMartService
                .getAiHelperTriggerResponse(dataMartId, triggerId)
                .catch(() => undefined);
              outcome = { kind: 'cancelled' };
            } else {
              const response = await dataMartService.getAiHelperTriggerResponse(
                dataMartId,
                triggerId
              );
              outcome = response.result
                ? { kind: 'ok', data: response.result }
                : { kind: 'cancelled' };
            }
            runStateRef.current = null;
            setPendingScope(null);
            return outcome;
          }

          await sleepWithSignal(POLLING_INTERVAL_MS, signal);
        } catch (error) {
          const message = extractPollErrorMessage(error);
          if (message) toast.error(message);
          runStateRef.current = null;
          setPendingScope(null);
          return { kind: 'failed' };
        }
      }
      // Stolen by a newer run — leave shared state to the active run.
      return { kind: 'cancelled' };
    },
    [isCurrentRun]
  );

  const generate = useCallback(
    async (dataMartId: string, pending: PendingScope): Promise<GenerateOutcome> => {
      cancelCurrentRun();
      setPendingScope(pending);

      const fieldName = isFieldScopedPending(pending) ? pending.fieldName : undefined;
      let outcome: GenerateOutcome = { kind: 'cancelled' };

      try {
        const { triggerId } = await dataMartService.createAiHelperTrigger(dataMartId, {
          scope: pending.scope,
          useSample: DEFAULT_USE_SAMPLE,
          fieldName,
        });

        const abortController = new AbortController();
        runStateRef.current = { triggerId, dataMartId, abortController };

        outcome = await pollTriggerStatus(dataMartId, triggerId, abortController.signal);
      } catch (error) {
        // POST failed (403 / 400 / 503 / network) — service-level `skipErrorToast`
        // keeps the global interceptor muted, so toast the backend message here.
        // `extractApiError` can return undefined for non-axios errors despite its type.
        const apiError = extractApiError(error) as ApiError | undefined;
        const message = apiError?.message;
        if (message) toast.error(message);
        setPendingScope(null);
        outcome = { kind: 'failed' };
      }

      if (outcome.kind === 'ok') {
        trackEvent({
          event: 'data_mart_ai_metadata_generated',
          category: 'DataMart',
          action: 'GenerateMetadata',
          label: pending.scope,
          context: dataMartId,
        });
      } else if (outcome.kind === 'failed') {
        trackEvent({
          event: 'data_mart_error',
          category: 'DataMart',
          action: 'GenerateMetadataError',
          label: pending.scope,
          context: dataMartId,
        });
      }

      return outcome;
    },
    [cancelCurrentRun, pollTriggerStatus]
  );

  const generateTitle = useCallback(
    async (dataMartId: string) => {
      const outcome = await generate(dataMartId, { scope: DataMartMetadataScope.TITLE });
      if (outcome.kind !== 'ok') return undefined;
      return outcome.data.title?.trim();
    },
    [generate]
  );

  const generateDescription = useCallback(
    async (dataMartId: string) => {
      const outcome = await generate(dataMartId, { scope: DataMartMetadataScope.DESCRIPTION });
      if (outcome.kind !== 'ok') return undefined;
      return outcome.data.description?.trim();
    },
    [generate]
  );

  const generateFieldAlias = useCallback(
    async (dataMartId: string, fieldName: string) => {
      const outcome = await generate(dataMartId, {
        scope: DataMartMetadataScope.FIELD_ALIAS,
        fieldName,
      });
      if (outcome.kind !== 'ok') return undefined;
      const match = outcome.data.fields?.find(f => f.name === fieldName);
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
      const outcome = await generate(dataMartId, {
        scope: DataMartMetadataScope.FIELD_DESCRIPTION,
        fieldName,
      });
      if (outcome.kind !== 'ok') return undefined;
      const match = outcome.data.fields?.find(f => f.name === fieldName);
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
      const outcome = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS,
      });
      if (outcome.kind !== 'ok') return undefined;
      const fields = outcome.data.fields ?? [];
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
      const outcome = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_ALIASES,
      });
      if (outcome.kind !== 'ok') return undefined;
      const fields = outcome.data.fields ?? [];
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
      const outcome = await generate(dataMartId, {
        scope: DataMartMetadataScope.ALL_FIELD_METADATA,
      });
      if (outcome.kind !== 'ok') return undefined;
      const fields = outcome.data.fields ?? [];
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
