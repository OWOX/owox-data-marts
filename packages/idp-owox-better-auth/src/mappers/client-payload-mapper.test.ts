import { describe, expect, it } from '@jest/globals';
import { toPayload } from './client-payload-mapper.js';

describe('toPayload', () => {
  it('maps a standard Identity OWOX payload without viewOnly', () => {
    const actual = toPayload(basePayload());

    expect(actual).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        email: 'user@example.com',
        fullName: 'User Example',
        roles: ['viewer'],
        projectTitle: 'Demo Project',
      })
    );
    expect(actual.viewOnly).toBeUndefined();
  });

  it('normalizes canonical viewOnly claim to Payload.viewOnly', () => {
    const actual = toPayload(basePayload({ viewOnly: true }));

    expect(actual.viewOnly).toBe(true);
  });

  it('does not map readOnly into viewOnly', () => {
    expect(toPayload(basePayload({ readOnly: true })).viewOnly).toBeUndefined();
  });

  it('does not set viewOnly when the claim is false', () => {
    const actual = toPayload(basePayload({ viewOnly: false }));

    expect(actual.viewOnly).toBeUndefined();
  });

  it('keeps roles independent from viewOnly', () => {
    const actual = toPayload(basePayload({ roles: ['admin'], viewOnly: true }));

    expect(actual.roles).toEqual(['admin']);
    expect(actual.viewOnly).toBe(true);
  });

  function basePayload(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'user-1',
      projectId: 'project-1',
      userEmail: 'user@example.com',
      userFullName: 'User Example',
      userAvatar: 'https://img.test/a.png',
      roles: ['viewer'],
      projectTitle: 'Demo Project',
      signinProvider: 'google',
      ...overrides,
    };
  }
});
