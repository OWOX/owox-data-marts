import { Reflector } from '@nestjs/core';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RejectPluginAuth: jest.requireActual('../../idp/decorators/reject-plugin-auth.decorator')
    .RejectPluginAuth,
  Role: { viewer: jest.fn() },
  Strategy: { INTROSPECT: 'introspect', PARSE: 'parse' },
}));

import { REJECT_PLUGIN_AUTH_METADATA } from '../../idp/decorators/reject-plugin-auth.decorator';
import { PluginAdminController } from './plugin-admin.controller';

/**
 * Suspend and resume are deployment-publisher operations. The publisher-key check already
 * turns a plugin runtime token away -- it has no api key id -- but the refusal belongs at
 * the guard too, so a future route on this controller cannot open by omission.
 */
describe('PluginAdminController plugin runtime authority', () => {
  const reflector = new Reflector();

  it.each(['suspend', 'resume'] as const)('refuses a plugin runtime token on %s', handler => {
    expect(
      reflector.getAllAndOverride<boolean>(REJECT_PLUGIN_AUTH_METADATA, [
        PluginAdminController.prototype[handler],
        PluginAdminController,
      ])
    ).toBe(true);
  });
});
