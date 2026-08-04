import { Reflector } from '@nestjs/core';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RejectApiKeyAuth: jest.requireActual('../../idp/decorators/reject-api-key-auth.decorator')
    .RejectApiKeyAuth,
  AllowPluginAuth: jest.requireActual('../../idp/decorators/allow-plugin-auth.decorator')
    .AllowPluginAuth,
  Role: { viewer: jest.fn() },
  Strategy: { INTROSPECT: 'introspect', PARSE: 'parse' },
}));

import { ALLOW_PLUGIN_AUTH_METADATA } from '../../idp/decorators/allow-plugin-auth.decorator';
import { PluginInstallationsController } from './plugin-installations.controller';

/**
 * A plugin runtime token carries the member's own authority, so nothing but this metadata
 * stands between a third-party page and the lifecycle of the plugins it sits next to.
 */
describe('PluginInstallationsController plugin runtime authority', () => {
  const reflector = new Reflector();

  const allowsPluginAuth = (handler: keyof PluginInstallationsController): boolean =>
    reflector.getAllAndOverride<boolean>(ALLOW_PLUGIN_AUTH_METADATA, [
      PluginInstallationsController.prototype[handler],
      PluginInstallationsController,
    ]) === true;

  // Silence, not an opt-out decorator: the guard denies whatever it is not told to allow,
  // so a lifecycle route added later is closed before anyone remembers to close it.
  it.each(['install', 'uninstall', 'update', 'updateByRepository', 'runtimeToken'] as const)(
    'refuses a plugin runtime token on %s',
    handler => {
      expect(allowsPluginAuth(handler)).toBe(false);
    }
  );

  // Reads stay open: this is the authority ctx.owox exists to carry.
  it.each(['list', 'entry'] as const)('leaves %s open to a plugin runtime token', handler => {
    expect(allowsPluginAuth(handler)).toBe(true);
  });
});
