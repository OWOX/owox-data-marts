/**
 * Accepts only absolute https URLs for use in plugin-facing <a href>.
 *
 * Plugin metadata and error details are untrusted strings. React escapes text, but an
 * `href` of `javascript:…` or `data:…` is still a click-execution path. Anything that is
 * not a parseable absolute https URL is refused rather than passed through.
 */
export function safeHttpsUrl(candidate: string | null | undefined): string | null {
  if (candidate == null || candidate === '') {
    return null;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') {
    return null;
  }

  // Normalised form so a weird-but-valid input cannot keep a misleading serialisation.
  return url.href;
}
