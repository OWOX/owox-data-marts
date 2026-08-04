/**
 * Lowercase, with every non-alphanumeric run collapsed to a dash. One shared
 * implementation on purpose: model-graph keys and OKF document filenames must
 * stay in lockstep, or the join links inside a bundle stop resolving.
 */
export function slugify(text: string, fallback = ''): string {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}
