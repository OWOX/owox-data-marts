/**
 * Utility functions for handling schema values safely in the UI.
 */

/**
 * Converts a value to a string, returning an empty string if the value is null or undefined.
 * This ensures type safety when displaying values in the UI.
 */
export function asString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}
