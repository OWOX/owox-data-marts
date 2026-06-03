import { buildProjectPath, getPathPrefix } from '../../../utils/path';

export const REDIRECT_TO_PARAM = 'redirect-to';
export const LEGACY_REQUEST_ACCESS_PATH = '/request-access';

export function buildProjectRequestAccessPath(projectId: string, redirectTo?: string): string {
  const path = buildProjectPath(projectId, LEGACY_REQUEST_ACCESS_PATH);

  if (!redirectTo) {
    return path;
  }

  const params = new URLSearchParams({ [REDIRECT_TO_PARAM]: redirectTo });
  return `${path}?${params.toString()}`;
}

export function isProjectRequestAccessPath(pathname: string, projectId: string): boolean {
  return normalizePath(pathname) === normalizePath(buildProjectRequestAccessPath(projectId));
}

export function getSafeProjectRedirect(search: string, projectId: string): string | null {
  const redirectTo = new URLSearchParams(search).get(REDIRECT_TO_PARAM);

  if (!redirectTo) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(redirectTo, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) {
    return null;
  }

  const projectRoot = `${getPathPrefix()}/${projectId}`;
  const projectPrefix = `${projectRoot}/`;
  const requestAccessPath = buildProjectRequestAccessPath(projectId);

  if (url.pathname !== projectRoot && !url.pathname.startsWith(projectPrefix)) {
    return null;
  }

  if (normalizePath(url.pathname) === normalizePath(requestAccessPath)) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
