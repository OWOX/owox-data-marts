import type { ManifestParameter } from './manifest.types';

const PARAMETER_REFERENCE = /\{\{\s*parameters\.([A-Za-z0-9_]+)\s*\}\}/g;

function collectReferences(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(PARAMETER_REFERENCE)) into.add(match[1]);
    return;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectReferences(nested, into);
  }
}

/**
 * The parameters that hold a credential: those marked SECRET and those the authentication
 * block refers to. The parser marks the latter SECRET only when the manifest is saved, so the
 * editor's copy of the manifest does not say so yet.
 */
export function credentialParameterNames(manifest: {
  parameters: Record<string, Pick<ManifestParameter, 'attributes'>>;
  authentication?: unknown;
}): Set<string> {
  const names = new Set(
    Object.entries(manifest.parameters)
      .filter(([, parameter]) => (parameter.attributes ?? []).includes('SECRET'))
      .map(([name]) => name)
  );
  collectReferences(manifest.authentication, names);
  return names;
}
