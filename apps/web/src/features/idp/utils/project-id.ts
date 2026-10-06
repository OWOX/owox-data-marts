import { PROJECT_PLACEHOLDER } from '../../../utils/path';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidProjectId(value?: string | null): value is string {
  return Boolean(value && PROJECT_ID_PATTERN.test(value));
}

export function normalizeProjectId(value?: string | null): string | null {
  return isValidProjectId(value) ? value : null;
}

export function getProjectIdFromPath(path: string): string | null {
  const match = /^\/ui\/([^/]+)/.exec(path);
  const projectId = normalizeProjectId(match?.[1] ?? null);
  // A placeholder link names no project; sign-in must not ask for one called "none".
  return projectId === PROJECT_PLACEHOLDER ? null : projectId;
}
