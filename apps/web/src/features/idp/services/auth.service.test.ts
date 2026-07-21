import { describe, expect, it } from 'vitest';
import { currentUserResponseToUser, isViewOnlySession } from './auth.service';
import type { CurrentUserResponse, User } from '../types';

describe('currentUserResponseToUser', () => {
  it('maps standard user fields without viewOnly', () => {
    const actual = currentUserResponseToUser(baseResponse());

    expect(actual).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'User Example',
      roles: ['viewer'],
      projectId: 'project-1',
      projectTitle: 'Demo Project',
      mcpServerUrl: undefined,
      avatar: 'https://img.test/a.png',
      onboarding: undefined,
      viewOnly: undefined,
    });
  });

  it('surfaces viewOnly only when the API returns true', () => {
    expect(currentUserResponseToUser(baseResponse({ viewOnly: true })).viewOnly).toBe(true);
    expect(currentUserResponseToUser(baseResponse({ viewOnly: false })).viewOnly).toBeUndefined();
    expect(currentUserResponseToUser(baseResponse()).viewOnly).toBeUndefined();
  });
});

describe('isViewOnlySession', () => {
  it('returns true only for users with viewOnly:true', () => {
    expect(isViewOnlySession({ id: 'u', projectId: 'p', viewOnly: true } satisfies User)).toBe(
      true
    );
    expect(isViewOnlySession({ id: 'u', projectId: 'p', viewOnly: false } satisfies User)).toBe(
      false
    );
    expect(isViewOnlySession({ id: 'u', projectId: 'p' } satisfies User)).toBe(false);
    expect(isViewOnlySession(null)).toBe(false);
    expect(isViewOnlySession(undefined)).toBe(false);
  });
});

function baseResponse(overrides: Partial<CurrentUserResponse> = {}): CurrentUserResponse {
  return {
    userId: 'user-1',
    projectId: 'project-1',
    email: 'user@example.com',
    fullName: 'User Example',
    avatar: 'https://img.test/a.png',
    roles: ['viewer'],
    projectTitle: 'Demo Project',
    ...overrides,
  };
}
