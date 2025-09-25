/**
 * Utility to check if an item should be visible based on settings flags
 * @param flagKey - The key to check in settings.flags
 * @param expectedValue - Expected value for the flag. If not provided, checks for truthy boolean value
 * @param flags
 * @returns boolean - whether the item should be visible
 */
export function checkVisible(
  flagKey: string,
  expectedValue?: boolean | string,
  flags?: Record<string, unknown> | null
): boolean {
  if (!flags || typeof flags !== 'object') {
    return false;
  }
  const flagValue = flags[flagKey];

  // If expectedValue is not provided, treat as boolean check (default true)
  if (expectedValue === undefined) {
    return Boolean(flagValue);
  }

  // Check for exact match with expected value
  return flagValue === expectedValue;
}
