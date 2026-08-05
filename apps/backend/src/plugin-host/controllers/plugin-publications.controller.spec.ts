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
import { PluginPublicationsController } from './plugin-publications.controller';

/**
 * A manual probe published a plugin from inside a running plugin -- `ctx.owox` reaching
 * `POST /api/plugins/publications` and getting an `ok`. The endpoint runs under an API key
 * (owox-ctl uses it), so it carries no `@RejectApiKeyAuth` for the coverage pairing rule to
 * mirror, and nothing else forced a `@RejectPluginAuth`.
 *
 * Publishing and unpublishing are the member's decisions, never the third-party page's, so
 * the whole controller refuses a plugin runtime token at the class level.
 */
describe('PluginPublicationsController plugin runtime authority', () => {
  const reflector = new Reflector();

  const refuses = (handler: keyof PluginPublicationsController): boolean =>
    reflector.getAllAndOverride<boolean>(REJECT_PLUGIN_AUTH_METADATA, [
      PluginPublicationsController.prototype[handler],
      PluginPublicationsController,
    ]) === true;

  it.each(['publish', 'unpublish', 'list'] as const)(
    'refuses a plugin runtime token on %s',
    handler => {
      expect(refuses(handler)).toBe(true);
    }
  );

  // Guards the mechanism the handlers rely on: the refusal is declared once, on the class.
  it('declares the refusal at the class level', () => {
    expect(Reflect.getMetadata(REJECT_PLUGIN_AUTH_METADATA, PluginPublicationsController)).toBe(
      true
    );
  });
});
