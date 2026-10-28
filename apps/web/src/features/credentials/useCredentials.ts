import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProjectId } from '../../shared/hooks';
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
  return { ...query, credentials: query.data ?? [] };
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

export function useGoogleOAuthAvailable() {
  const projectId = useProjectId();
  const query = useQuery({
    queryKey: ['credential-google-oauth-settings', projectId],
    queryFn: () => credentialsService.getGoogleOAuthSettings(),
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  // undefined while the settings load, so callers can wait before choosing a provider.
  return query.isPending ? undefined : (query.data?.available ?? false);
}

export function useCredentialActions() {
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

  const create = useMutation({
    mutationFn: (input: CreateCredentialRequest) => credentialsService.create(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCredentialRequest }) =>
      credentialsService.update(id, input),
    onSuccess: invalidateWithListeners,
  });
  const authorizeGoogleOAuth = useMutation({
    mutationFn: (input: { redirectUri: string; credentialId?: string; definitionId?: string }) =>
      credentialsService.authorizeGoogleOAuth(input),
  });
  const exchangeGoogleOAuth = useMutation({
    mutationFn: (input: GoogleOAuthExchangeRequest) =>
      credentialsService.exchangeGoogleOAuth(input),
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
    validate: validate.mutateAsync,
    consentDefinition: consentDefinition.mutateAsync,
    addGithubDefinition: addGithubDefinition.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || update.isPending || addGithubDefinition.isPending,
    isValidating: validate.isPending,
    isDeleting: remove.isPending,
  };
}
