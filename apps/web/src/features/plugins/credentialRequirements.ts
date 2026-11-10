import type { NormalizedPluginCredentialRequirement } from '../credentials/types';
import type { OwoxAiStatus } from './types';

/** The selection value the backend reads as "use the deployment's AI configuration". */
export const OWOX_AI_SELECTION = 'owox-ai';

/** OWOX AI serves a logical requirement only when it has every model the plugin declares. */
export function offersOwoxAi(
  owoxAi: OwoxAiStatus | undefined,
  requirement: NormalizedPluginCredentialRequirement
): boolean {
  const served: readonly string[] = owoxAi?.models ?? [];
  return (
    requirement.definitionId === null &&
    served.length > 0 &&
    requirement.models.every(model => served.includes(model))
  );
}

/** How the install dialog and the Credentials tab name a requirement and the providers it accepts. */
export function getRequirementPresentation(
  requirement: NormalizedPluginCredentialRequirement,
  definitions: readonly { id: string; displayName: string; supportsAi: boolean }[],
  credentials: readonly {
    definition: { id: string; displayName: string; supportsAi: boolean };
  }[],
  owoxAiOffered = false
): { label: string; providers: string } {
  const availableDefinitions = [
    ...definitions,
    ...credentials.map(credential => credential.definition),
  ];

  if (requirement.definitionId !== null) {
    const definition = availableDefinitions.find(item => item.id === requirement.definitionId);
    const providerName = definition?.displayName ?? humanizeIdentifier(requirement.definitionId);
    return {
      label: definition?.displayName ?? humanizeIdentifier(requirement.key),
      providers: `Provider: ${providerName}`,
    };
  }

  const providerNames = [
    ...new Set(
      availableDefinitions
        .filter(definition => definition.supportsAi)
        .map(definition => definition.displayName)
    ),
  ];

  const allowed = [
    ...(owoxAiOffered ? ['OWOX AI'] : []),
    ...(providerNames.length > 0 ? providerNames : ['any AI-capable Credential']),
  ];

  return {
    label: requirement.key.toLowerCase() === 'ai' ? 'AI' : humanizeIdentifier(requirement.key),
    providers: `Allowed providers: ${allowed.join(', ')}`,
  };
}

/**
 * What changing the grants starts from: each granted Credential or OWOX AI, and Do not grant
 * for an optional requirement granted nothing. A required one granted nothing stays undecided.
 */
export function grantedCredentialSelections(
  requirements: readonly NormalizedPluginCredentialRequirement[],
  granted: Readonly<Record<string, string>> | undefined
): Record<string, string | null> {
  // Grants that could not be read (an older backend, a failed request) decide nothing, not
  // even Do not grant: saving that would revoke an optional grant the member never touched.
  if (!granted) return {};
  return Object.fromEntries(
    requirements.flatMap((requirement): [string, string | null][] => {
      const credentialId = grantedCredentialId(granted, requirement.key);
      if (credentialId) return [[requirement.key, credentialId]];
      return requirement.optional ? [[requirement.key, null]] : [];
    })
  );
}

/** Own keys only: a requirement named like an Object member must not read the prototype. */
export function grantedCredentialId(
  granted: Readonly<Record<string, string>>,
  key: string
): string | undefined {
  return Object.prototype.hasOwnProperty.call(granted, key) ? granted[key] : undefined;
}

function humanizeIdentifier(value: string): string {
  const words = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!words) return 'Credential';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
