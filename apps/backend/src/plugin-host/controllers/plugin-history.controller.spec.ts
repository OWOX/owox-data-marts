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
import { ListPluginHistoryCommand } from '../dto/domain/list-plugin-history.command';
import { ListPluginHistoryQueryApiDto } from '../dto/presentation/plugin-history-api.dto';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { ListPluginHistoryService } from '../use-cases/list-plugin-history.service';
import { PluginHistoryController } from './plugin-history.controller';

describe('PluginHistoryController', () => {
  it('refuses a plugin runtime token', () => {
    expect(
      new Reflector().getAllAndOverride<boolean>(REJECT_PLUGIN_AUTH_METADATA, [
        PluginHistoryController.prototype.list,
        PluginHistoryController,
      ])
    ).toBe(true);
  });

  it('defaults the query and maps the page', async () => {
    const occurredAt = new Date('2026-10-01T10:00:00.000Z');
    const service = {
      run: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'e1',
            occurredAt,
            action: PluginAuditAction.PUBLISH,
            scope: 'project',
            plugin: { pluginId: 'p1', displayName: 'Dashboards', ownerName: 'acme' },
            actor: { kind: 'member', name: 'Max' },
            version: null,
          },
        ],
        nextCursor: 'e1',
      }),
    };
    const controller = new PluginHistoryController(
      service as unknown as ListPluginHistoryService,
      new PluginPresentationMapper()
    );
    const context = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;

    await expect(controller.list(context, {})).resolves.toEqual({
      items: [
        {
          id: 'e1',
          occurredAt: '2026-10-01T10:00:00.000Z',
          action: 'publish',
          scope: 'project',
          plugin: { pluginId: 'p1', displayName: 'Dashboards', ownerName: 'acme' },
          actor: { kind: 'member', name: 'Max' },
          version: null,
        },
      ],
      nextCursor: 'e1',
    });
    expect(service.run).toHaveBeenCalledWith(
      new ListPluginHistoryCommand(context, 'all', 50, null)
    );
  });

  describe('query', () => {
    const invalid = async (query: Record<string, string>) =>
      (await validate(plainToInstance(ListPluginHistoryQueryApiDto, query))).map(
        error => error.property
      );

    it('accepts a full query', async () => {
      expect(
        await invalid({
          type: 'publications',
          limit: '100',
          cursor: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
        })
      ).toEqual([]);
    });

    it.each([
      ['an unknown type', { type: 'everything' }, 'type'],
      ['a zero limit', { limit: '0' }, 'limit'],
      ['a limit above 100', { limit: '101' }, 'limit'],
      ['a non-numeric limit', { limit: 'ten' }, 'limit'],
      ['a cursor that is not a UUID', { cursor: 'abc' }, 'cursor'],
    ])('rejects %s', async (_case, query, property) => {
      expect(await invalid(query)).toEqual([property]);
    });
  });
});
