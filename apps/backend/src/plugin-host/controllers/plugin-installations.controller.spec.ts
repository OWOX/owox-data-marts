import { Reflector } from '@nestjs/core';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RejectApiKeyAuth: jest.requireActual('../../idp/decorators/reject-api-key-auth.decorator')
    .RejectApiKeyAuth,
  RejectPluginAuth: jest.requireActual('../../idp/decorators/reject-plugin-auth.decorator')
    .RejectPluginAuth,
  Role: { viewer: jest.fn() },
  Strategy: { INTROSPECT: 'introspect', PARSE: 'parse' },
}));

import { REJECT_PLUGIN_AUTH_METADATA } from '../../idp/decorators/reject-plugin-auth.decorator';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { CheckPluginReleaseCommand } from '../dto/domain/check-plugin-release.command';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { CheckPluginReleaseService } from '../use-cases/check-plugin-release.service';
import { PluginInstallationsController } from './plugin-installations.controller';

/**
 * A plugin runtime token carries the member's own authority, so nothing but this metadata
 * stands between a third-party page and the lifecycle of the plugins it sits next to.
 */
describe('PluginInstallationsController plugin runtime authority', () => {
  const reflector = new Reflector();

  const rejectsPluginAuth = (handler: keyof PluginInstallationsController): boolean =>
    reflector.getAllAndOverride<boolean>(REJECT_PLUGIN_AUTH_METADATA, [
      PluginInstallationsController.prototype[handler],
      PluginInstallationsController,
    ]) === true;

  it.each([
    'install',
    'uninstall',
    'update',
    'updateByRepository',
    'runtimeToken',
    'check',
  ] as const)('refuses a plugin runtime token on %s', handler => {
    expect(rejectsPluginAuth(handler)).toBe(true);
  });

  // Reads stay open: this is the authority ctx.owox exists to carry.
  it.each(['list', 'entry'] as const)('leaves %s open to a plugin runtime token', handler => {
    expect(rejectsPluginAuth(handler)).toBe(false);
  });
});

describe('PluginInstallationsController check', () => {
  it('maps the body to a check command and returns the mapped result', async () => {
    const result = {
      pluginId: 'p1',
      repository: 'OWOX/example',
      commitSha: 'abc',
      candidateVersion: '1.5.0',
      baselineVersion: '1.4.0',
      collectionsEvaluated: true,
      issues: [{ code: ReleaseRejectionCode.URL_UNREACHABLE, detail: 'did not respond' }],
    };
    const checkService = { run: jest.fn().mockResolvedValue(result) };
    const unused = {} as never;
    const controller = new PluginInstallationsController(
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      checkService as unknown as CheckPluginReleaseService,
      new PluginPresentationMapper()
    );
    const context = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;

    await expect(
      controller.check(context, { repository: 'OWOX/example', ref: 'main', version: 'v1.5.0' })
    ).resolves.toEqual(result);
    expect(checkService.run).toHaveBeenCalledWith(
      new CheckPluginReleaseCommand(context, 'OWOX/example', 'main', 'v1.5.0')
    );
  });
});
