import type { ConnectorSpecificationResponseApiDto } from '../api/types/response';
import { ConnectorSpecificationAttribute } from '../enums/connector-specification-attribute.enum';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
  return true;
}

/**
 * A `oneOf` dependency (for example `AuthType`) is ready once one option is
 * selected and that option carries at least one value: a managed OAuth
 * credential reference, a pasted secret, or a masked secret of a saved config.
 */
function isOneOfDependencyReady(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const [selectedOption] = Object.keys(value);
  if (!selectedOption) return false;
  return hasMeaningfulValue(value[selectedOption]);
}

export function hasDynamicOptions(specification: ConnectorSpecificationResponseApiDto): boolean {
  return (
    specification.attributes?.includes(ConnectorSpecificationAttribute.DYNAMIC_OPTIONS) ?? false
  );
}

/**
 * Tells whether every field the dynamic options depend on has a usable value,
 * so the options request has a chance to succeed.
 */
export function areDynamicOptionDependenciesReady(
  configuration: Record<string, unknown>,
  dependsOn: string[] | undefined
): boolean {
  if (!dependsOn || dependsOn.length === 0) return true;

  return dependsOn.every(dependency => {
    const value = configuration[dependency];
    return isRecord(value) ? isOneOfDependencyReady(value) : hasMeaningfulValue(value);
  });
}

/**
 * Stable key of the dependency values: options are reloaded only when it changes,
 * so edits to unrelated fields never trigger a new provider request.
 */
export function getDynamicOptionsDependencyKey(
  configuration: Record<string, unknown>,
  dependsOn: string[] | undefined
): string {
  const picked = (dependsOn ?? []).reduce<Record<string, unknown>>((acc, dependency) => {
    acc[dependency] = configuration[dependency];
    return acc;
  }, {});

  return JSON.stringify(picked);
}
