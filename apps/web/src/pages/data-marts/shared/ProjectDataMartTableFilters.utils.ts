import type { UserProjection } from '../../../shared/types';

export function buildProjectTableUserLabelMapper(users: (UserProjection | null | undefined)[]) {
  const userLabelMap = new Map<string, string>();

  for (const user of users) {
    if (!user) continue;
    userLabelMap.set(user.userId, user.fullName ?? user.email ?? user.userId);
  }

  return (userId: string) => userLabelMap.get(userId) ?? userId;
}

export function matchesProjectTableSearch(query: string, values: unknown[]) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return values.flatMap(toSearchValues).join(' ').toLowerCase().includes(normalizedQuery);
}

function toSearchValues(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(toSearchValues);
  if (value instanceof Date) return [value.toISOString()];

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return [String(value)];
    default:
      return [];
  }
}
