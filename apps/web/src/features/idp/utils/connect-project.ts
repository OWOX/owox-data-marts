import { isSafePath, RedirectStorageService } from '../services/redirect-storage.service';
import { getProjectIdFromPath } from './project-id';

export const CONNECT_SWITCH_ATTEMPT_KEY = 'owox_connect_project_switch';

export interface ConnectProjectTarget {
  projectId: string;
  url: string;
}

export function getConnectProjectTarget(value: string): ConnectProjectTarget | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\u2028\u2029]/.test(value)) return null;
  try {
    const url = new URL(value, window.location.origin);
    const segments = url.pathname.split('/');
    const [ui = '', project = '', connect = ''] = segments.slice(1, 4).map(decodeURIComponent);
    if (ui.toLowerCase() !== 'ui' || connect.toLowerCase() !== 'connect') return null;
    const projectId = getProjectIdFromPath(`/ui/${project}`);
    if (!projectId || projectId !== project) return null;
    // React Router decodes route segments and matches static segments without case sensitivity.
    const canonical =
      ['', 'ui', projectId, 'connect', ...segments.slice(4)].join('/') + url.search + url.hash;
    return isSafePath(canonical) ? { projectId, url: canonical } : null;
  } catch {
    return null;
  }
}

/** Only the auth landing page can resume a stored connect target. */
export function getPendingConnectProjectTarget(): ConnectProjectTarget | null {
  const current = window.location.pathname + window.location.search + window.location.hash;
  return (
    getConnectProjectTarget(current) ??
    (window.location.pathname === '/'
      ? getConnectProjectTarget(RedirectStorageService.retrieve() ?? '')
      : null)
  );
}

export class ConnectProjectMismatchError extends Error {
  constructor(readonly target: ConnectProjectTarget) {
    super(`This setup requires project ${target.projectId}. Switch to that project to continue.`);
    this.name = 'ConnectProjectMismatchError';
  }
}

export class ConnectAccountMismatchError extends Error {
  constructor(readonly target: ConnectProjectTarget) {
    super(
      'The signed-in account changed. Sign out. Then sign in with the account that started this setup.'
    );
    this.name = 'ConnectAccountMismatchError';
  }
}
