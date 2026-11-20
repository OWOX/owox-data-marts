import { PROJECT_PLACEHOLDER } from '../../../utils/path';
import { isMyAccountPath } from './my-account-path';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidProjectId(value?: string | null): value is string {
  return Boolean(value && PROJECT_ID_PATTERN.test(value));
}

export function normalizeProjectId(value?: string | null): string | null {
  return isValidProjectId(value) ? value : null;
}

function getProjectPathSegment(path: string): string | null {
  if (isMyAccountPath(path)) return null;
  return /^\/ui\/([^/]+)/i.exec(path)?.[1] ?? null;
}

export function isProjectPath(path: string): boolean {
  return getProjectPathSegment(path) !== null;
}

export function getProjectIdFromPath(path: string): string | null {
  const projectId = normalizeProjectId(getProjectPathSegment(path));
  // A placeholder link names no project; sign-in must not ask for one called "none".
  return projectId === PROJECT_PLACEHOLDER ? null : projectId;
}
