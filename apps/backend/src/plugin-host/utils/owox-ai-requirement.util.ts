import {
  normalizeCredentialRequirement,
  type NormalizedCredentialRequirement,
  type StoredCredentialRequirement,
} from '../../data-marts/credentials/credential.types';

/** Returns the one requirement that asks for an AI model instead of a stored Credential. */
export function logicalAiRequirement(requirements: readonly StoredCredentialRequirement[]): {
  stored: StoredCredentialRequirement;
  normalized: NormalizedCredentialRequirement;
} | null {
  for (const stored of requirements) {
    const normalized = normalizeCredentialRequirement(stored);
    if (normalized.definitionId === null) {
      return { stored, normalized };
    }
  }
  return null;
}

export function withoutRequirement(
  requirements: readonly StoredCredentialRequirement[],
  key: string
): StoredCredentialRequirement[] {
  return requirements.filter(
    requirement => normalizeCredentialRequirement(requirement).key !== key
  );
}
