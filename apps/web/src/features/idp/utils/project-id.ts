const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidProjectId(value?: string | null): value is string {
  return Boolean(value && PROJECT_ID_PATTERN.test(value));
}

export function normalizeProjectId(value?: string | null): string | null {
  return isValidProjectId(value) ? value : null;
}

export function getProjectIdFromPath(path: string): string | null {
  const match = /^\/ui\/([^/]+)/.exec(path);
  return normalizeProjectId(match?.[1] ?? null);
}
