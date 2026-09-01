import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProjectId } from '../../shared/hooks';
import { credentialsService } from './credentials.service';
import type { CreateCredentialRequest, UpdateCredentialRequest } from './types';

const CREDENTIALS_KEY = 'credentials';
const DEFINITIONS_KEY = 'credential-definitions';

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

export function useCredentialActions() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [CREDENTIALS_KEY, projectId] });

  const create = useMutation({
    mutationFn: (input: CreateCredentialRequest) => credentialsService.create(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCredentialRequest }) =>
      credentialsService.update(id, input),
    onSuccess: invalidate,
  });
  const validate = useMutation({
    mutationFn: (id: string) => credentialsService.validate(id),
    onSuccess: invalidate,
  });
  const consentDefinition = useMutation({
    mutationFn: (id: string) => credentialsService.consentDefinition(id),
    onSuccess: invalidate,
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
    validate: validate.mutateAsync,
    consentDefinition: consentDefinition.mutateAsync,
    addGithubDefinition: addGithubDefinition.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: create.isPending || update.isPending || addGithubDefinition.isPending,
    isValidating: validate.isPending,
    isDeleting: remove.isPending,
  };
}
