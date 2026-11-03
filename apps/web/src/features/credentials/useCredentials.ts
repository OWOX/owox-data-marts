import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useProjectId } from '../../shared/hooks';
import { useAuth } from '../idp';
import { credentialsService } from './credentials.service';
import type {
  CreateCredentialRequest,
  Credential,
  GoogleOAuthExchangeRequest,
  UpdateCredentialRequest,
} from './types';

const CREDENTIALS_KEY = 'credentials';
const DEFINITIONS_KEY = 'credential-definitions';

const savedListeners = new Set<(saved: Credential) => void>();

/** Calls the listener after a Credential is changed, so a feature that caches its use can drop it. */
export function onCredentialSaved(listener: (saved: Credential) => void): () => void {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}

export function useCredentials() {
  const projectId = useProjectId();
  const query = useQuery({
    queryKey: [CREDENTIALS_KEY, projectId],
    queryFn: () => credentialsService.list(),
    enabled: Boolean(projectId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    ...query,
    credentials: query.data?.credentials ?? [],
    unavailableCredentials: query.data?.unavailable ?? [],
  };
}

export function useCredential(id: string | null) {
  const projectId = useProjectId();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [CREDENTIALS_KEY, projectId, user?.id, id],
    queryFn: id ? () => credentialsService.getById(id) : skipToken,
    enabled: Boolean(projectId && id),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    ...query,
    credential: query.data ?? null,
    // Wait for the first read on each mount, even when metadata is cached.
    isLoading: query.isLoading || (query.isFetching && !query.isFetchedAfterMount),
  };
}

export function useCredentialDefinitions() {
  const projectId = useProjectId();
  const query = useQuery({
    queryKey: [DEFINITIONS_KEY, projectId],
    queryFn: () => credentialsService.listDefinitions(),
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, definitions: query.data ?? [] };
}

export function useGoogleOAuthSettings(client?: 'storage' | 'destination') {
  const projectId = useProjectId();
  const query = useQuery({
    queryKey: ['credential-google-oauth-settings', projectId],
    queryFn: () => credentialsService.getGoogleOAuthSettings(),
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    // undefined while the settings load, so callers can wait before choosing a provider.
    available: query.isPending
      ? undefined
      : ((client && query.data?.clients?.[client]) ?? query.data?.available ?? false),
  };
}

/** Whether Google OAuth is set up, for one client when named. */
export function useGoogleOAuthAvailable(client?: 'storage' | 'destination') {
  return useGoogleOAuthSettings(client).available;
}

export function useCredentialActions({ skipErrorToast }: { skipErrorToast?: boolean } = {}) {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [CREDENTIALS_KEY, projectId] });

  const invalidateWithListeners = (saved: Credential) => {
    savedListeners.forEach(listener => {
      listener(saved);
    });
    return invalidate();
  };

  const create = useSecretMutation({
    mutationFn: (input: CreateCredentialRequest) =>
      credentialsService.create(input, skipErrorToast),
    onSuccess: invalidate,
  });
  const update = useSecretMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCredentialRequest }) =>
      credentialsService.update(id, input, skipErrorToast),
    onSuccess: invalidateWithListeners,
  });
  const authorizeGoogleOAuth = useMutation({
    mutationFn: ({
      skipErrorToast,
      ...input
    }: {
      redirectUri: string;
      credentialId?: string;
      definitionId?: string;
      /** The caller shows the failure itself. */
      skipErrorToast?: boolean;
    }) => credentialsService.authorizeGoogleOAuth(input, skipErrorToast),
  });
  const exchangeGoogleOAuth = useSecretMutation({
    mutationFn: ({
      skipErrorToast,
      ...input
    }: GoogleOAuthExchangeRequest & { skipErrorToast?: boolean }) =>
      credentialsService.exchangeGoogleOAuth(input, skipErrorToast),
    onSuccess: invalidateWithListeners,
  });
  // A connector's sign-in returns only the id of the Credential it saved.
  const loadConnected = useMutation({
    mutationFn: (id: string) => credentialsService.getById(id),
    onSuccess: invalidateWithListeners,
  });
  const validate = useMutation({
    mutationFn: (id: string) => credentialsService.validate(id),
    onSuccess: invalidateWithListeners,
  });
  const consentDefinition = useMutation({
    mutationFn: (id: string) => credentialsService.consentDefinition(id),
    onSuccess: invalidateWithListeners,
  });
  const addGithubDefinition = useMutation({
    mutationFn: (repository: string) => credentialsService.addGithubDefinition(repository),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [DEFINITIONS_KEY, projectId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => credentialsService.remove(id),
    onSuccess: invalidate,
  });

  return {
    create: create.mutateAsync,
    update: update.mutateAsync,
    authorizeGoogleOAuth: authorizeGoogleOAuth.mutateAsync,
    exchangeGoogleOAuth: exchangeGoogleOAuth.mutateAsync,
    loadConnected: loadConnected.mutateAsync,
    validate: validate.mutateAsync,
    consentDefinition: consentDefinition.mutateAsync,
    addGithubDefinition: addGithubDefinition.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || update.isPending || addGithubDefinition.isPending,
    isValidating: validate.isPending,
    isDeleting: remove.isPending,
  };
}

function useSecretMutation<TVariables>(options: UseMutationOptions<Credential, Error, TVariables>) {
  const mutation = useMutation({ ...options, gcTime: 0 });
  const { status, reset } = mutation;
  useEffect(() => {
    // Reset detaches the observer; gcTime also removes the cached request and its secrets.
    if (status === 'success' || status === 'error') reset();
  }, [status, reset]);
  return mutation;
}
