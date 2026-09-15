import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectorApiService } from '../../api/connector-api.service';
import { extractApiError } from '../../../../../app/api';
import type { ConnectorFieldOptionResponseApiDto } from '../../api/types/response';
import {
  areDynamicOptionDependenciesReady,
  getDynamicOptionsDependencyKey,
} from '../../utils/dynamic-options.utils';

export const DYNAMIC_OPTIONS_DEBOUNCE_MS = 400;

interface UseConnectorFieldOptionsParams {
  connectorName: string;
  field: string;
  configuration: Record<string, unknown>;
  dependsOn?: string[];
}

export type ConnectorFieldOptionsStatus = 'waiting' | 'loading' | 'loaded' | 'error';

export interface ConnectorFieldOptionsState {
  status: ConnectorFieldOptionsStatus;
  options: ConnectorFieldOptionResponseApiDto[];
  error: string | null;
  /** Dependency key the current `options` were loaded for. */
  loadedKey: string | null;
  reload: () => void;
}

/**
 * Loads the allowed values of a DYNAMIC_OPTIONS configuration field from the
 * backend once every field it depends on is filled. Reloads only when those
 * dependencies change, debounces typing, and drops stale responses.
 */
export function useConnectorFieldOptions({
  connectorName,
  field,
  configuration,
  dependsOn,
}: UseConnectorFieldOptionsParams): ConnectorFieldOptionsState {
  const dependencyKey = getDynamicOptionsDependencyKey(configuration, dependsOn);
  const dependenciesReady = areDynamicOptionDependenciesReady(configuration, dependsOn);

  const [status, setStatus] = useState<ConnectorFieldOptionsStatus>('waiting');
  const [options, setOptions] = useState<ConnectorFieldOptionResponseApiDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    if (!dependenciesReady) {
      requestIdRef.current += 1;
      setStatus('waiting');
      setOptions([]);
      setError(null);
      setLoadedKey(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus('loading');
    setError(null);

    const timeout = setTimeout(() => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      void new ConnectorApiService()
        .previewConnectorFieldOptions(connectorName, field, configurationRef.current, {
          signal: abortController.signal,
          // The field renders the failure inline; a background lookup must not
          // toast or flash the global loading indicator while the user types.
          skipErrorToast: true,
          skipLoadingIndicator: true,
        })
        .then(response => {
          if (requestId !== requestIdRef.current) return;
          setOptions(response);
          setLoadedKey(dependencyKey);
          setStatus('loaded');
        })
        .catch((requestError: unknown) => {
          if (requestId !== requestIdRef.current || abortController.signal.aborted) return;
          setOptions([]);
          setLoadedKey(null);
          setError(
            extractApiError(requestError).message ??
              (requestError instanceof Error ? requestError.message : 'Unknown error')
          );
          setStatus('error');
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            abortControllerRef.current = null;
          }
        });
    }, DYNAMIC_OPTIONS_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
    };
    // `configuration` is intentionally read through a ref: only the dependency
    // values (folded into `dependencyKey`) may trigger a new request.
  }, [connectorName, field, dependencyKey, dependenciesReady, reloadToken]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    },
    []
  );

  return { status, options, error, loadedKey, reload };
}
