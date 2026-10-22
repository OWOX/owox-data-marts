import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { ExecutionTokenNotAllowedError } from '../errors/plugin-action.errors';
import { ownerOf, writerOf } from './plugin-schedule-runtime-access';

const context = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
  projectId: 'project-1',
  userId: 'user-1',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
  ...overrides,
});

describe('ownerOf', () => {
  it('takes the installation, plugin and project from the token', () => {
    expect(ownerOf(context())).toStrictEqual({
      installationId: 'installation-1',
      pluginId: 'plugin-1',
      projectId: 'project-1',
    });
  });

  it.each([
    ['no plugin', { pluginId: undefined }],
    ['no installation', { installationId: undefined }],
  ])('refuses a context with %s', (_name, overrides) => {
    const attempt = () => ownerOf(context(overrides));

    expect(attempt).toThrow(ForbiddenException);
    expect(attempt).toThrow('Plugin runtime authentication is required');
  });
});

describe('writerOf', () => {
  it('answers the owner for a plugin page', () => {
    expect(writerOf(context())).toMatchObject({ installationId: 'installation-1' });
  });

  it('refuses an execution token with the exact error', () => {
    const attempt = () => writerOf(context({ executionId: 'execution-1' }));

    expect(attempt).toThrow(ExecutionTokenNotAllowedError);
    expect(attempt).toThrow('A backend action cannot change schedules');
  });

  it('still refuses a context that has no installation', () => {
    expect(() => writerOf(context({ installationId: undefined }))).toThrow(ForbiddenException);
  });
});
