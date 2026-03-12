/**
 * Shared validation factory for data storage fully qualified names and table patterns.
 *
 * Each data storage type has its own allowed character set and hierarchy depth,
 * but the validation logic is identical: match dot-separated identifier segments
 * against a character class.
 */

export interface IdentifierValidatorConfig {
  /** Regex character class contents for allowed identifier chars, e.g. 'a-zA-Z0-9_\\-' */
  allowedChars: string;
  /** Whether a 2-level hierarchy (e.g. schema.table) is valid in addition to 3-level */
  allowTwoLevel: boolean;
  /** Whether `*` wildcard is allowed in the last segment (for table patterns) */
  allowWildcard: boolean;
}

/**
 * - `allowWildcard: false` — fully qualified names (e.g. project.dataset.table)
 * - `allowWildcard: true`  — table patterns (e.g. project.dataset.table_*)
 */
export function createIdentifierValidator(
  config: IdentifierValidatorConfig
): (value: string) => boolean {
  const { allowedChars, allowTwoLevel, allowWildcard } = config;
  const segment = `[${allowedChars}]+`;
  const lastSegment = allowWildcard ? `[${allowedChars}*]+` : segment;
  const threeLevel = new RegExp(`^${segment}\\.${segment}\\.${lastSegment}$`);
  const twoLevel = allowTwoLevel ? new RegExp(`^${segment}\\.${lastSegment}$`) : null;

  return (value: string): boolean => {
    if (!value) return false;
    return threeLevel.test(value) || (twoLevel?.test(value) ?? false);
  };
}
