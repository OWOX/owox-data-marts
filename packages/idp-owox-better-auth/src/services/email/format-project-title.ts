/**
 * Mail clients turn domain-like text such as "acme.com" into links,
 * so dots in a project title become spaces.
 */
export function formatProjectTitle(title: string): string {
  return title.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}
