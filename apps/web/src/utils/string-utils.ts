/**
 * Capitalizes the first letter of a string.
 *
 * @param str - The string to capitalize
 * @returns The string with the first letter capitalized, or the original string if empty
 *
 */
export function capitalizeFirstLetter(str: string): string {
  if (!str) {
    return str;
  }

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a human-readable label into a snake_case slug safe for use as an
 * SQL alias (lowercase letters, digits and underscores only).
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Return `base` if it is not in `taken`, otherwise append `_2`, `_3`, ... until
 * a free variant is found. Used to guarantee unique aliases when multiple items
 * share the same slugified title.
 */
export function generateUniqueAlias(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) {
    i += 1;
  }
  return `${base}_${i}`;
}
