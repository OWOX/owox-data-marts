import { buildProjectPath, resolveProjectPlaceholder } from '../../../utils/path';
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
