import { describe, expect, it } from '@jest/globals';
import { IntrospectionResponseSchema } from './introspectionDto.js';

describe('IntrospectionResponseSchema', () => {
  it('accepts active responses with and without viewOnly', () => {
    expect(IntrospectionResponseSchema.parse(activeResponse()).viewOnly).toBeUndefined();
    expect(IntrospectionResponseSchema.parse(activeResponse({ viewOnly: true })).viewOnly).toBe(
      true
    );
  });

  it('accepts inactive responses from IB with and without viewOnly', () => {
    expect(IntrospectionResponseSchema.parse(inactiveResponse()).viewOnly).toBeUndefined();
    expect(IntrospectionResponseSchema.parse(inactiveResponse({ viewOnly: false })).viewOnly).toBe(
      false
    );
  });

  it('accepts the minimal inactive response contract', () => {
    expect(IntrospectionResponseSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('rejects a non-boolean viewOnly claim in inactive responses', () => {
    expect(() =>
      IntrospectionResponseSchema.parse(inactiveResponse({ viewOnly: 'false' }))
    ).toThrow();
  });

  it('accepts plugin runtime identity claims in an active response', () => {
    expect(
      IntrospectionResponseSchema.parse(
        activeResponse({
          authFlow: 'plugin',
          pluginId: 'plugin-1',
          installationId: 'installation-1',
        })
      )
    ).toEqual(
      expect.objectContaining({
        authFlow: 'plugin',
        pluginId: 'plugin-1',
        installationId: 'installation-1',
      })
    );
  });

  function activeResponse(overrides: Record<string, unknown> = {}) {
    return {
      isActive: true,
      userId: 'user-1',
      projectId: 'project-1',
      userEmail: 'user@example.com',
      userFullName: 'User Example',
      userAvatar: 'https://img.test/a.png',
      roles: ['viewer'],
      projectTitle: 'Demo Project',
      signinProvider: 'google',
      authFlow: 'app_owox',
      apiKeyId: null,
      ...overrides,
    };
  }

  function inactiveResponse(overrides: Record<string, unknown> = {}) {
    return {
      isActive: false,
      userId: null,
      projectId: null,
      userEmail: null,
      userFullName: null,
      userAvatar: null,
      roles: null,
      projectTitle: null,
      authFlow: null,
      apiKeyId: null,
      ...overrides,
    };
  }
});
