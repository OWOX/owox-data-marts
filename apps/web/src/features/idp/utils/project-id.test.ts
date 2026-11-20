import { describe, expect, it } from 'vitest';
import { isMyAccountPath } from './my-account-path';
import { getProjectIdFromPath, isProjectPath } from './project-id';

describe('personal account namespace', () => {
  it.each([
    '/ui/me',
    '/ui/me/',
    '/ui/me?tab=profile#details',
    '/ui/me/profile',
    '/ui/me/api-keys',
    '/ui/me/unknown/nested?tab=profile#details',
    '/UI/ME/Unknown/',
  ])('reserves %s for account routes, never for a project named me', path => {
    expect(isMyAccountPath(path)).toBe(true);
    expect(isProjectPath(path)).toBe(false);
    expect(getProjectIdFromPath(path)).toBeNull();
  });

  it.each([
    ['/ui/me-project/data-marts', 'me-project'],
    ['/ui/members/data-marts', 'members'],
    ['/ui/project-1/me/api-keys', 'project-1'],
  ])('keeps %s project-scoped', (path, projectId) => {
    expect(isMyAccountPath(path)).toBe(false);
    expect(isProjectPath(path)).toBe(true);
    expect(getProjectIdFromPath(path)).toBe(projectId);
  });
});
