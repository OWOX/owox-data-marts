import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../app/api/extract-api-error.util';
import { useProjectId } from '../../shared/hooks';
import { useAuth } from '../idp';
import { credentialSetupService } from './credential-setup.service';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialSetup,
  UpdateCredentialRequest,
} from './types';
import {
  useCredential,
  useCredentialActions,
  useCredentialDefinitions,
  useGoogleOAuthSettings,
} from './useCredentials';

export function useCredentialSetup(setupId: string) {
  const projectId = useProjectId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['credential-setup', projectId, user?.id, setupId];
  const storageKey = `credential-setup:${projectId}:${user?.id}:${setupId}`;
  const [savedCredentialId, setSavedCredentialId] = useState(() => readSavedId(storageKey));
  const savedIdRef = useRef(savedCredentialId);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const [operation, setOperation] = useState<'saving' | 'completing' | 'cancelling' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actions = useCredentialActions({ skipErrorToast: true });

  const query = useQuery({
    queryKey,
    queryFn: () => credentialSetupService.getById(setupId),
    enabled: Boolean(projectId && setupId),
    retry: false,
    refetchOnWindowFocus: current => !current.state.error,
    refetchOnReconnect: current => !current.state.error,
    // Keep input after a failed read, and require an explicit retry before polling resumes.
    refetchInterval: current =>
      current.state.data?.status === 'pending' && !current.state.error ? 5_000 : false,
  });
  const setup = query.data;
  const needsForm = setup?.status === 'pending' && !savedCredentialId;
  const definitionsQuery = useCredentialDefinitions();
  const credentialQuery = useCredential(
    needsForm && setup.mode === 'update' ? setup.credentialId : null
  );
  const definition =
    setup?.mode === 'update'
      ? credentialQuery.credential?.definition
      : definitionsQuery.definitions.find(item => item.id === setup?.definitionId);
  const oauthSettingsQuery = useGoogleOAuthSettings(
    definition?.auth?.type === 'oauth' ? definition.auth.client : undefined
  );
  const needsOAuthSettings =
    needsForm &&
    (definition?.auth?.type === 'oauth' ||
      (setup.mode === 'create' &&
        !setup.definitionId &&
        definitionsQuery.definitions.some(item => item.auth?.type === 'oauth')));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (setup?.status === 'completed' && setup.credentialId === savedIdRef.current)
      storeSavedId(storageKey, null);
    else if (setup && setup.status !== 'pending') setSavedCredentialId(savedIdRef.current);
  }, [setup, storageKey]);

  const currentSetup = () => queryClient.getQueryData<CredentialSetup>(queryKey);
  const isSetupVerified = () => queryClient.getQueryState(queryKey)?.status === 'success';
  const rememberSavedId = (id: string) => {
    savedIdRef.current = id;
    if (mounted.current) setSavedCredentialId(id);
    storeSavedId(storageKey, id);
  };

  const recordOAuthSave = (id: string, interrupted: boolean) => {
    savedIdRef.current = id;
    storeSavedId(storageKey, id);
    // Keep any provider finish step mounted; recovery never invokes a stale completion callback.
    if (
      mounted.current &&
      (interrupted || !isSetupVerified() || currentSetup()?.status !== 'pending')
    ) {
      setSavedCredentialId(id);
    }
  };

  const completeSaved = async (credentialId: string) => {
    rememberSavedId(credentialId);
    if (!mounted.current || !isSetupVerified() || currentSetup()?.status !== 'pending') return;
    setOperation('completing');
    try {
      const completed = await credentialSetupService.complete(setupId, credentialId);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, completed);
      if (completed.status === 'completed' && completed.credentialId === credentialId)
        storeSavedId(storageKey, null);
    } catch {
      setActionError('OWOX saved your Credential but could not complete setup. Retry completion.');
      // Completion can fail if another tab cancelled setup or the request expired.
      await query.refetch();
    }
  };

  const retryCompletion = async () => {
    if (
      !mounted.current ||
      busyRef.current ||
      !isSetupVerified() ||
      !savedIdRef.current ||
      currentSetup()?.status !== 'pending'
    )
      return;
    busyRef.current = true;
    setActionError(null);
    try {
      await completeSaved(savedIdRef.current);
    } finally {
      busyRef.current = false;
      setOperation(null);
    }
  };

  const save = async (input: CreateCredentialRequest | UpdateCredentialRequest) => {
    const current = currentSetup();
    if (busyRef.current || !isSetupVerified() || current?.status !== 'pending') return;
    if (savedIdRef.current) return retryCompletion();
    busyRef.current = true;
    setOperation('saving');
    setActionError(null);
    try {
      const saved =
        current.mode === 'update' && current.credentialId
          ? await actions.update({
              id: current.credentialId,
              input: input as UpdateCredentialRequest,
            })
          : await actions.create(input as CreateCredentialRequest);
      await completeSaved(saved.id);
    } catch (error) {
      setActionError(apiErrorMessage(error, 'OWOX could not save the Credential. Try again.'));
    } finally {
      busyRef.current = false;
      setOperation(null);
    }
  };

  const onOAuthConnected = async (saved: Credential) => {
    if (!mounted.current || currentSetup()?.status !== 'pending') return;
    // The OAuth flow already saved the Credential. Use only its ID to complete setup.
    rememberSavedId(saved.id);
    await retryCompletion();
  };

  const cancel = async () => {
    if (busyRef.current || currentSetup()?.status !== 'pending') return;
    busyRef.current = true;
    setOperation('cancelling');
    setActionError(null);
    try {
      const cancelled = await credentialSetupService.cancel(setupId);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, cancelled);
    } catch {
      setActionError('OWOX could not cancel setup. Try again.');
      await query.refetch();
    } finally {
      busyRef.current = false;
      setOperation(null);
    }
  };

  const retryLoad = async () => {
    await Promise.all([
      query.refetch(),
      definitionsQuery.refetch(),
      oauthSettingsQuery.refetch(),
      ...(needsForm && setup.mode === 'update' && setup.credentialId
        ? [credentialQuery.refetch()]
        : []),
    ]);
  };

  return {
    setup,
    setupNotFound:
      query.isLoadingError && (query.error as AxiosError | null)?.response?.status === 404,
    credential: credentialQuery.credential,
    definitions: definitionsQuery.definitions,
    definition,
    oauthAvailable: oauthSettingsQuery.available,
    verificationError: setup?.status === 'pending' && query.isRefetchError ? query.error : null,
    isVerifying: query.isFetching,
    isLoading:
      query.isPending ||
      (needsForm &&
        (definitionsQuery.isLoading ||
          (setup.mode === 'update' && Boolean(setup.credentialId) && credentialQuery.isLoading))) ||
      (needsOAuthSettings && oauthSettingsQuery.isPending),
    // A temporary background error must not remove the form and its unsaved secrets.
    loadError:
      (query.isLoadingError ? query.error : null) ??
      (needsForm
        ? ((definitionsQuery.isLoadingError ? definitionsQuery.error : null) ??
          credentialQuery.error)
        : null) ??
      (needsOAuthSettings && oauthSettingsQuery.isLoadingError ? oauthSettingsQuery.error : null),
    savedCredentialId,
    operation,
    actionError,
    save,
    recordOAuthSave,
    onOAuthConnected,
    retryCompletion,
    cancel,
    retryLoad,
  };
}

function readSavedId(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeSavedId(key: string, id: string | null): void {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    // The saved ID remains in memory if session storage is blocked.
  }
}
