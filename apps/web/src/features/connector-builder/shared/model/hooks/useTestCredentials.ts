import { useCallback, useEffect, useState } from 'react';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import type { CredentialRequirementDto, FittingCredentialsQuery } from '../../api/types';

export type TestCredentials =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; ids: string[]; requirement: CredentialRequirementDto };

const PAUSE_MS = 400;

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
    | ({ key: string; attempt: number } & (
        | { error: true }
        | { ids: string[]; requirement: CredentialRequirementDto }
      ))
    | null
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
          setSettled({ key: pausedKey, attempt, ids: list.map(item => item.id), requirement });
      },
      () => {
        if (!cancelled) setSettled({ key: pausedKey, attempt, error: true });
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
        ? { status: 'error' }
        : { status: 'ready', ids: settled.ids, requirement: settled.requirement };
  }
  return { state, retry, refresh, refreshing };
}
