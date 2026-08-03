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

  it.each(['install', 'uninstall', 'update', 'updateByRepository', 'runtimeToken'] as const)(
    'refuses a plugin runtime token on %s',
    handler => {
      expect(rejectsPluginAuth(handler)).toBe(true);
    }
  );

  // Reads stay open: this is the authority ctx.owox exists to carry.
  it.each(['list', 'entry'] as const)('leaves %s open to a plugin runtime token', handler => {
    expect(rejectsPluginAuth(handler)).toBe(false);
  });
});
