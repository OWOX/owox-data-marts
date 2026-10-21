import { buildProjectPath, getPathPrefix, resolveProjectPlaceholder } from '../../../utils/path';
import { getProjectIdFromPath } from './project-id';

export function requestAccessRedirectTarget(input: {
  storedRedirect: string | null;
  currentUrl: string;
  currentPath: string;
  projectId: string;
}): string {
  const stored = input.storedRedirect
    ? resolveProjectPlaceholder(input.storedRedirect, input.projectId)
    : null;
  const storedProjectId = stored ? getProjectIdFromPath(stored) : null;

  if (stored && (!storedProjectId || storedProjectId === input.projectId)) {
    return stored;
  }
  if (input.currentPath === '/') {
    return buildProjectPath(input.projectId, '/data-marts');
  }
  return resolveProjectPlaceholder(input.currentUrl, input.projectId);
}

export function storedRedirectTarget(input: {
  storedRedirect: string | null;
  currentUrl: string;
  projectId: string;
}): string | null {
  if (!input.storedRedirect) {
    return null;
  }
  const stored = resolveProjectPlaceholder(input.storedRedirect, input.projectId);
  if (input.currentUrl === stored) {
    return null;
  }

  const storedProjectId = getProjectIdFromPath(stored);
  if (!storedProjectId || storedProjectId === input.projectId) {
    return stored;
  }
  return getProjectIdFromPath(input.currentUrl) === storedProjectId
    ? `/ui/${input.projectId}`
    : null;
}

/**
 * A first-run step such as the invite step after sign-up (`/ui/:projectId/onboarding/...`).
 * These pages continue to the stored deep link themselves, so the post-auth redirect must
 * not jump past them. Case-insensitive, like the router's own matching.
 */
export function isOnboardingStepPath(path: string): boolean {
  const prefix = `${getPathPrefix()}/`.toLowerCase();
  const lower = path.toLowerCase();
  if (!lower.startsWith(prefix)) return false;
  return lower.slice(prefix.length).split('/')[1] === 'onboarding';
}
