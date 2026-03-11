/**
 * Shared validation factory utilities for data storage fully qualified names.
 *
 * Each data storage type has its own allowed character set and hierarchy depth,
 * but the validation logic is identical: match dot-separated identifier segments
 * against a character class, with an optional wildcard (`*`) in the last segment
 * for table-pattern validators.
 */

export interface StorageValidationConfig {
  /** Regex character class contents for allowed identifier chars, e.g. 'a-zA-Z0-9_\\-' */
  allowedChars: string;
  /** Whether a 2-level hierarchy (e.g. schema.table) is valid in addition to 3-level */
  allowTwoLevel: boolean;
}

/**
 * Creates a validator for fully qualified names (e.g. project.dataset.table).
 *
 * @param config - Storage-specific validation configuration
 * @returns A function that validates whether a string is a valid fully qualified name
 */
export function createFullyQualifiedNameValidator(
  config: StorageValidationConfig
): (value: string) => boolean {
  const { allowedChars, allowTwoLevel } = config;
  const segment = `[${allowedChars}]+`;
  const threeLevel = new RegExp(`^${segment}\\.${segment}\\.${segment}$`);
  const twoLevel = allowTwoLevel ? new RegExp(`^${segment}\\.${segment}$`) : null;

  return (value: string): boolean => {
    if (!value) return false;
    return threeLevel.test(value) || (twoLevel?.test(value) ?? false);
  };
}

/**
 * Creates a validator for table patterns with wildcard support (e.g. project.dataset.table_*).
 * The wildcard `*` is only allowed in the last segment.
 *
 * @param config - Storage-specific validation configuration
 * @returns A function that validates whether a string is a valid table pattern
 */
export function createTablePatternValidator(
  config: StorageValidationConfig
): (value: string) => boolean {
  const { allowedChars, allowTwoLevel } = config;
  const segment = `[${allowedChars}]+`;
  const lastSegment = `[${allowedChars}*]+`;
  const threeLevel = new RegExp(`^${segment}\\.${segment}\\.${lastSegment}$`);
  const twoLevel = allowTwoLevel ? new RegExp(`^${segment}\\.${lastSegment}$`) : null;

  return (value: string): boolean => {
    if (!value) return false;
    return threeLevel.test(value) || (twoLevel?.test(value) ?? false);
  };
}
