import type { FilterAccessors, FilterConfigItem } from '../../shared/components/TableFilters';
import { collectOptionsFromData } from '../../shared/components/TableFilters/collectOptions.utils';
import {
  buildAvailabilityFilter,
  classifyAvailability,
} from '../../shared/components/TableFilters/availability-filter.utils';
import type { Credential } from './types';

export type CredentialFilterKey =
  | 'provider'
  | 'state'
  | 'validation'
  | 'owners'
  | 'contexts'
  | 'sharing';

export const credentialFilterAccessors: FilterAccessors<CredentialFilterKey, Credential> = {
  provider: credential => credential.definition.id,
  state: credential => credentialState(credential),
  validation: credential => credential.validationState,
  owners: credential => credential.ownerUsers.map(owner => owner.userId),
  contexts: credential => credential.contexts.map(context => context.id),
  sharing: credential =>
    classifyAvailability(credential.availableForUse, credential.availableForMaintenance),
};

export function buildCredentialTableFilters(
  credentials: Credential[]
): FilterConfigItem<CredentialFilterKey>[] {
  const providerLabels = new Map(
    credentials.map(credential => [credential.definition.id, credential.definition.displayName])
  );
  const ownerLabels = new Map<string, string>();
  const contextLabels = new Map<string, string>();

  for (const credential of credentials) {
    for (const owner of credential.ownerUsers) {
      ownerLabels.set(owner.userId, owner.fullName ?? owner.email ?? owner.userId);
    }
    for (const context of credential.contexts) {
      contextLabels.set(context.id, context.name);
    }
  }

  return [
    {
      id: 'provider',
      label: 'Provider',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(credentials, credentialFilterAccessors.provider, {
        labelMapper: provider => providerLabels.get(provider) ?? provider,
      }),
    },
    {
      id: 'state',
      label: 'State',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: [
        { value: 'enabled', label: 'Enabled' },
        { value: 'disabled', label: 'Disabled' },
        { value: 'definition-update-pending', label: 'Definition update pending' },
      ],
    },
    {
      id: 'validation',
      label: 'Validation',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: [
        { value: 'verified', label: 'Verified' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'unknown', label: 'Unknown' },
      ],
    },
    {
      id: 'owners',
      label: 'Owners',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(credentials, credentialFilterAccessors.owners, {
        labelMapper: ownerId => ownerLabels.get(ownerId) ?? ownerId,
      }),
    },
    {
      id: 'contexts',
      label: 'Contexts',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(credentials, credentialFilterAccessors.contexts, {
        labelMapper: contextId => contextLabels.get(contextId) ?? contextId,
      }),
    },
    buildAvailabilityFilter<CredentialFilterKey>({
      id: 'sharing',
      firstLabel: 'Shared for use',
    }),
  ];
}

export function matchesCredentialSearch(credential: Credential, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return [
    credential.title,
    credential.definition.displayName,
    credential.definition.id,
    ...credential.ownerUsers.flatMap(owner => [owner.fullName, owner.email]),
  ].some(value => value?.toLocaleLowerCase().includes(normalizedQuery));
}

function credentialState(
  credential: Credential
): 'enabled' | 'disabled' | 'definition-update-pending' {
  if (credential.definitionConsentRequired) return 'definition-update-pending';
  return credential.enabled ? 'enabled' : 'disabled';
}
