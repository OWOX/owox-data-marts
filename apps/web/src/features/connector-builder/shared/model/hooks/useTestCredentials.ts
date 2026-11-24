import { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { extractApiError } from '../../../../../app/api/extract-api-error.util';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import type {
  CredentialRequirementDto,
  FittingCredentialRefusal,
  FittingCredentialsQuery,
} from '../../api/types';

interface Listed {
  /** The fitting Credentials, in the server's order. */
  ids: string[];
  /** Why each refused Credential cannot be chosen, by id. */
  refusals: Record<string, FittingCredentialRefusal>;
  requirement: CredentialRequirementDto;
}

export type TestCredentials =
  | { status: 'loading' }
  | { status: 'error'; reason?: string }
  | ({ status: 'ready' } & Listed);

const PAUSE_MS = 400;

/** The server's message for a refusal that a retry cannot change: a 4xx other than 408 and 429. */
export function credentialsLoadReason(error: unknown): string | undefined {
  const status = (error as AxiosError | undefined)?.response?.status;
  if (status === undefined || status < 400 || status > 499 || status === 408 || status === 429) {
    return undefined;
  }
  // A proxy can send a non-string message, and trim() on it would throw in the rejection handler.
  const message: unknown = extractApiError(error).message;
  return typeof message === 'string' && message.trim() ? message.trim() : undefined;
}

/** The Credentials that fit the manifest being tested and what a new one must hold, asked once typing pauses. */
export function useTestCredentials(
  query: FittingCredentialsQuery | null,
  pauseMs = PAUSE_MS,
  known?: CredentialRequirementDto
) {
  const key = query && JSON.stringify(query);
  const [pausedKey, setPausedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<
    ({ key: string; attempt: number } & ({ error: true; reason?: string } | Listed)) | null
  >(null);

  useEffect(() => {
    if (!key) {
      setPausedKey(null);
      return;
    }
    const timer = setTimeout(() => {
      setPausedKey(key);
    }, pauseMs);
    return () => {
      clearTimeout(timer);
    };
  }, [key, pauseMs]);

  useEffect(() => {
    if (!pausedKey) return;
    let cancelled = false;
    const api = new ConnectorBuilderApiService();
    const asked = JSON.parse(pausedKey) as FittingCredentialsQuery;
    void Promise.all([
      api.fittingCredentials(asked),
      known ?? api.credentialRequirement(asked),
    ]).then(
      ([list, requirement]) => {
        if (!cancelled)
          setSettled({
            key: pausedKey,
            attempt,
            ids: list.filter(item => !item.refusal).map(item => item.id),
            refusals: Object.fromEntries(
              list.flatMap(item => (item.refusal ? [[item.id, item.refusal] as const] : []))
            ),
            requirement,
          });
      },
      (error: unknown) => {
        if (!cancelled)
          setSettled({
            key: pausedKey,
            attempt,
            error: true,
            reason: credentialsLoadReason(error),
          });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [pausedKey, attempt, known]);

  const retry = useCallback(() => {
    setSettled(null);
    setAttempt(count => count + 1);
  }, []);

  // Re-asks while the last list stays on screen, for a Credential created after it was fetched.
  const refresh = useCallback(() => {
    setAttempt(count => count + 1);
  }, []);
  const refreshing = settled !== null && settled.attempt !== attempt;

  let state: TestCredentials = { status: 'loading' };
  if (key && settled?.key === key) {
    state =
      'error' in settled
        ? { status: 'error', ...(settled.reason && { reason: settled.reason }) }
        : {
            status: 'ready',
            ids: settled.ids,
            refusals: settled.refusals,
            requirement: settled.requirement,
          };
  }
  return { state, retry, refresh, refreshing };
}
