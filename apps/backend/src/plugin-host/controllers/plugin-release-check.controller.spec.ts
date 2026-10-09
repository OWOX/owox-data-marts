import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

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
import { AuthorizationContext } from '../../idp/types/auth.types';
import { CheckPluginReleaseCommand } from '../dto/domain/check-plugin-release.command';
import { CheckPluginReleaseApiDto } from '../dto/presentation/publication-api.dto';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { CheckPluginReleaseService } from '../use-cases/check-plugin-release.service';
import { PluginReleaseCheckController } from './plugin-release-check.controller';

describe('PluginReleaseCheckController', () => {
  it('refuses a plugin runtime token', () => {
    expect(
      new Reflector().getAllAndOverride<boolean>(REJECT_PLUGIN_AUTH_METADATA, [
        PluginReleaseCheckController.prototype.check,
        PluginReleaseCheckController,
      ])
    ).toBe(true);
  });

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
    const controller = new PluginReleaseCheckController(
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

  describe('ref', () => {
    const invalidProperties = async (ref: string) =>
      (
        await validate(plainToInstance(CheckPluginReleaseApiDto, { repository: 'OWOX/x', ref }))
      ).map(error => error.property);

    it.each(['main', 'feature/x', 'v1.5.0', 'a'.repeat(40)])('accepts %s', async ref => {
      expect(await invalidProperties(ref)).toEqual([]);
    });

    it.each([
      ['whitespace', 'feature x'],
      ['a control character', 'main\u0000'],
      ['a lone surrogate', 'main\uD800'],
    ])('rejects %s', async (_case, ref) => {
      expect(await invalidProperties(ref)).toEqual(['ref']);
    });
  });

  it('rejects an empty version', async () => {
    const errors = await validate(
      plainToInstance(CheckPluginReleaseApiDto, { repository: 'OWOX/x', ref: 'main', version: '' })
    );

    expect(errors.map(error => error.property)).toEqual(['version']);
  });
});
