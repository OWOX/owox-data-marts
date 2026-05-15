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
 *
 * The polling/cancellation architecture mirrors `useSqlDryRunTrigger`: a single
 * try/catch around the poll body, ownership gated by `isCurrentRun(triggerId)` +
 * `!signal.aborted` in the while condition, and terminal state (`pendingScope` /
 * `runStateRef`) cleared inline at the terminal branches rather than in `finally`.
 */

/**
 * One generate() invocation's outcome:
 * - `ok`     — AI returned a payload (the per-scope caller may still find its slice empty)
 * - `failed` — backend or network error; a user-facing toast has already been shown
 * - `cancelled` — the run was aborted (signal) or backend-cancelled; silent
 */
type GenerateOutcome =
  | { kind: 'ok'; data: GenerateDataMartMetadataResponseDto }
  | { kind: 'failed' }
  | { kind: 'cancelled' };

/**
 * Resolve a user-facing error message from an axios error inside `pollTriggerStatus`.
 *
 * The catch covers two distinct error shapes that look identical at the network
 * level but write the human message into different fields:
 *
 * 1. Trigger ERROR — `UiTriggerService.getTriggerResponse` does
 *    `throw new BadRequestException(uiResponse)` with `uiResponse = { error: '…' }`.
 *    NestJS spreads our object into the body verbatim, so the real text is at
 *    `data.error` (and `data.message` becomes the default `'BadRequestException'`).
 * 2. Transport / framework errors (4xx with string-arg exceptions, 5xx, etc.) —
 *    NestJS's `createBody(string, …)` puts the human text into `data.message`.
 *
 * The 400-with-data.error shape is unambiguously case (1) since case (2) for 400
 * doesn't carry an `error` field of its own.
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

export function useAiHelper(): UseAiHelperResult {
  const [pendingScope, setPendingScope] = useState<PendingScope | null>(null);
  const runStateRef = useRef<RunState | null>(null);

  const isCurrentRun = useCallback((triggerId: string): boolean => {
    return runStateRef.current?.triggerId === triggerId;
  }, []);

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
   * Poll the trigger until it reaches a terminal status, mirroring
   * `useSqlDryRunTrigger.pollTriggerStatus` shape:
   *
   * - Ownership gate `!signal.aborted && isCurrentRun(triggerId)` in the while
   *   condition — if a newer run has taken over `runStateRef`, our next iteration
   *   exits without touching shared state.
   * - Single try/catch around the body: transport errors and the
   *   `BadRequestException` thrown by `getTriggerResponse` on status=ERROR both
   *   land in the same handler.
   * - `runStateRef`/`pendingScope` cleared inline at terminal branches (success
   *   path or error path), never in a `finally`. A stolen run that exits via the
   *   loop check returns `{ kind: 'cancelled' }` without mutating state.
   *
   * The only special case is backend status=CANCELLED: we drain the response
   * silently (no toast) because the row is only ever produced by our own
   * `cancelCurrentRun` flow — the user already knows.
   */
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
      // Stolen by a newer run (signal aborted or runStateRef replaced) — leave
      // shared state alone, the active run owns it.
      return { kind: 'cancelled' };
    },
    [isCurrentRun]
  );

  const generate = useCallback(
    async (dataMartId: string, pending: PendingScope): Promise<GenerateOutcome> => {
      // A new click while another run is in flight aborts the previous one.
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
        // POST createAiHelperTrigger failed (403 / 400 / 503 / network). Surface the
        // backend message — without this the global axios interceptor stays muted
        // (our service-level `skipErrorToast`) and the user gets no feedback.
        // `extractApiError` lies about its declared return type — for non-axios
        // errors it can be undefined — so re-narrow before reading `.message`.
        const apiError = extractApiError(error) as ApiError | undefined;
        const message = apiError?.message;
        if (message) toast.error(message);
        // Mirror dry-run's setErrorResult — clear the spinner unconditionally on
        // POST failure. (The dry-run-style concurrent-POST race remains: if a
        // parallel newer generate is mid-POST, this clears its spinner too.)
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
