import { createHash } from 'node:crypto';
import type { CredentialRequirementSnapshot } from '../credential.types';

export function requirementRevision(requirement: CredentialRequirementSnapshot): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        'definitionIds' in requirement
          ? { definitionIds: requirement.definitionIds, scopes: requirement.scopes }
          : {
              key: requirement.key,
              definitionId: requirement.definitionId,
              optional: requirement.optional,
              models: requirement.models,
              // Added only when present, so every revision saved before scopes existed stays the same.
              ...(requirement.scopes?.length ? { scopes: requirement.scopes } : {}),
            }
      )
    )
    .digest('hex');
}
