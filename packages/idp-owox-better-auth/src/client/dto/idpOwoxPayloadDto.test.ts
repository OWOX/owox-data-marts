import { describe, expect, it } from '@jest/globals';
import { IdpOwoxPayloadSchema } from './idpOwoxPayloadDto.js';

describe('IdpOwoxPayloadSchema', () => {
  it('parses blank role claim as an empty roles array', () => {
    const actual = IdpOwoxPayloadSchema.parse(payload({ roles: '' }));

    expect(actual.roles).toEqual([]);
  });

  it('accepts an empty roles array', () => {
    const actual = IdpOwoxPayloadSchema.parse(payload({ roles: [] }));

    expect(actual.roles).toEqual([]);
  });

  it('requires the roles claim to be present', () => {
    expect(() => IdpOwoxPayloadSchema.parse(payload({ roles: undefined }))).toThrow();
  });

  function payload(overrides: { roles?: unknown }) {
    const base: Record<string, unknown> = {
      userId: 'user-1',
      projectId: 'project-1',
      userEmail: 'user@example.com',
      userFullName: 'User Example',
      userAvatar: 'https://img.test/a.png',
      roles: ['viewer'],
      projectTitle: 'Demo Project',
      signinProvider: 'google',
    };

    if (Object.prototype.hasOwnProperty.call(overrides, 'roles')) {
      if (overrides.roles === undefined) {
        delete base.roles;
      } else {
        base.roles = overrides.roles;
      }
    }

    return base;
  }
});
