export const DEFAULT_PROJECT_LIST_LIMIT = 100;
export const MAX_PROJECT_LIST_LIMIT = 100;

export interface ProjectListPagination {
  limit: number;
  offset: number;
}

export function normalizeProjectListPagination(
  limit: unknown,
  offset: unknown
): ProjectListPagination {
  return {
    limit: normalizeLimit(limit),
    offset: normalizeOffset(offset),
  };
}

function normalizeLimit(value: unknown): number {
  const parsed = parseInteger(value);

  if (parsed === null || parsed <= 0) {
    return DEFAULT_PROJECT_LIST_LIMIT;
  }

  return Math.min(parsed, MAX_PROJECT_LIST_LIMIT);
}

function normalizeOffset(value: unknown): number {
  const parsed = parseInteger(value);

  if (parsed === null || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function parseInteger(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor(parsed);
}
