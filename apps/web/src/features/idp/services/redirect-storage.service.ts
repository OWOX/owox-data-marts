const REDIRECT_URL_KEY = 'owox_auth_redirect_url';

export function isSafePath(value: string | null | undefined): value is string {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (trimmed.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\u2028\u2029]/.test(trimmed)) return false;

  try {
    const url = new URL(trimmed, window.location.origin);

    if (url.origin !== window.location.origin) return false;

    const path = url.pathname;
    if (path !== '/ui' && !path.startsWith('/ui/')) return false;

    if (path.includes('/../') || path.endsWith('/..')) return false;

    return !(url.protocol !== 'http:' && url.protocol !== 'https:');
  } catch {
    return false;
  }
}

export const RedirectStorageService = {
  save(url: string): void {
    if (!isSafePath(url)) return;
    if (url.startsWith('/auth/')) return;
    sessionStorage.setItem(REDIRECT_URL_KEY, url);
  },

  retrieve(): string | null {
    const value = sessionStorage.getItem(REDIRECT_URL_KEY);
    return isSafePath(value) ? value : null;
  },

  clear(): void {
    sessionStorage.removeItem(REDIRECT_URL_KEY);
  },
};
