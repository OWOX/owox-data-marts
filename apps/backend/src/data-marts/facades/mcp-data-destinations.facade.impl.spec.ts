jest.mock('../use-cases/list-data-destinations.service', () => ({
  ListDataDestinationsService: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import type { DestinationCredentialSummary } from '../data-destination-types/destination-credential-state';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { McpDataDestinationsFacadeImpl } from './mcp-data-destinations.facade.impl';
import { McpDestinationMapper } from '../mappers/mcp-destination.mapper';

function createFacade(
  listDataDestinationsService: Pick<ListDataDestinationsService, 'run'>
): McpDataDestinationsFacadeImpl {
  return new McpDataDestinationsFacadeImpl(
    listDataDestinationsService as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    new McpDestinationMapper()
  );
}

function createFacadeForCreate(
  overrides: { createDataDestinationService?: Pick<CreateDataDestinationService, 'run'> } = {}
) {
  const createDataDestinationService = {
    run: jest.fn(overrides.createDataDestinationService?.run),
  };
  return {
    facade: new McpDataDestinationsFacadeImpl(
      null as never,
      createDataDestinationService as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      new McpDestinationMapper()
    ),
    createDataDestinationService,
  };
}

function buildDestination(overrides: {
  id: string;
  title: string;
  type: DataDestinationType;
  createdByUser?: UserProjectionDto | null;
  ownerUsers?: UserProjectionDto[];
  availableForUse?: boolean;
}): DataDestinationDto {
  return new DataDestinationDto(
    overrides.id,
    overrides.title,
    overrides.type,
    'project-1',
    new Date('2026-06-01T10:00:00.000Z'),
    new Date('2026-06-02T10:00:00.000Z'),
    null,
    overrides.createdByUser ?? null,
    overrides.ownerUsers ?? [],
    overrides.availableForUse ?? true,
    false,
    [],
    null,
    null,
    undefined
  );
}

describe('McpDataDestinationsFacadeImpl', () => {
  it('lists destinations using project-member context and maps the DTO', async () => {
    const listDataDestinationsService = {
      run: jest.fn().mockResolvedValue([
        buildDestination({
          id: 'dest_1',
          title: 'Marketing Sheet',
          type: DataDestinationType.GOOGLE_SHEETS,
          createdByUser: new UserProjectionDto('user-1', 'Ann', 'ann@owox.com'),
        }),
        buildDestination({
          id: 'dest_2',
          title: 'Ops Teams',
          type: DataDestinationType.MS_TEAMS,
          createdByUser: null,
        }),
      ]),
    } as unknown as jest.Mocked<ListDataDestinationsService>;

    const facade = createFacade(listDataDestinationsService);

    const result = await facade.listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });

    expect(listDataDestinationsService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
      })
    );
    expect(result).toMatchObject({
      destinations: [
        {
          id: 'dest_1',
          name: 'Marketing Sheet',
          type: 'google_sheets',
          owner: 'ann@owox.com',
          connectedGoogleAccount: null,
          createdAt: '2026-06-01T10:00:00.000Z',
        },
        {
          id: 'dest_2',
          name: 'Ops Teams',
          type: 'teams',
          owner: null,
          connectedGoogleAccount: null,
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      ],
    });
  });

  it('names the Google account the Destinations list names to the same member, without reading more', async () => {
    const sheet = (id: string, summary: DestinationCredentialSummary | null) =>
      new DataDestinationDto(
        id,
        id,
        DataDestinationType.GOOGLE_SHEETS,
        'project-1',
        new Date('2026-06-01T10:00:00.000Z'),
        new Date('2026-06-02T10:00:00.000Z'),
        null,
        null,
        [],
        true,
        true,
        [],
        null,
        summary
      );
    const account = { definitionId: 'google-sheets-oauth', identity: 'me@gmail.com' };
    const listDataDestinationsService = {
      run: jest.fn().mockResolvedValue([
        sheet('visible', {
          access: 'visible',
          id: 'c',
          title: 'c',
          providerName: 'p',
          state: 'ready',
          ...account,
        }),
        sheet('restricted', { access: 'restricted', state: 'ready', ...account }),
        sheet('pending', { access: 'pending', state: 'ready', ...account }),
        sheet('sa', {
          access: 'restricted',
          state: 'ready',
          definitionId: 'google-service-account',
          identity: 'robot@p.iam.gserviceaccount.com',
        }),
        sheet('no-identity', { access: 'restricted', state: 'ready' }),
        // A binding whose Credential is gone, or a Destination with neither.
        sheet('none', null),
        new DataDestinationDto(
          'chat',
          'chat',
          DataDestinationType.GOOGLE_CHAT,
          'project-1',
          new Date('2026-06-01T10:00:00.000Z'),
          new Date('2026-06-02T10:00:00.000Z'),
          null,
          null,
          [],
          true,
          true,
          [],
          null,
          { access: 'restricted', state: 'ready', ...account }
        ),
      ]),
    };

    const result = await createFacade(listDataDestinationsService).listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });

    // A service account completed no OAuth consent, as with its old row.
    expect(result.destinations.map(d => [d.id, d.connectedGoogleAccount])).toEqual([
      ['visible', 'me@gmail.com'],
      ['restricted', 'me@gmail.com'],
      ['pending', 'me@gmail.com'],
      ['sa', null],
      ['no-identity', null],
      ['none', null],
      ['chat', null],
    ]);
  });

  it('maps every destination type to the lowercase MCP vocabulary', async () => {
    const listDataDestinationsService = {
      run: jest
        .fn()
        .mockResolvedValue([
          buildDestination({ id: '1', title: 'gs', type: DataDestinationType.GOOGLE_SHEETS }),
          buildDestination({ id: '2', title: 'ls', type: DataDestinationType.LOOKER_STUDIO }),
          buildDestination({ id: '3', title: 'em', type: DataDestinationType.EMAIL }),
          buildDestination({ id: '4', title: 'sl', type: DataDestinationType.SLACK }),
          buildDestination({ id: '5', title: 'tm', type: DataDestinationType.MS_TEAMS }),
          buildDestination({ id: '6', title: 'gc', type: DataDestinationType.GOOGLE_CHAT }),
        ]),
    } as unknown as jest.Mocked<ListDataDestinationsService>;

    const facade = createFacade(listDataDestinationsService);

    const result = await facade.listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: [],
    });

    expect(result.destinations.map(d => d.type)).toEqual([
      'google_sheets',
      'looker_studio',
      'email',
      'slack',
      'teams',
      'google_chat',
    ]);
  });

  it('includes private destinations and exposes their sharing status', async () => {
    const listDataDestinationsService = {
      run: jest.fn().mockResolvedValue([
        buildDestination({
          id: 'usable',
          title: 'Usable',
          type: DataDestinationType.GOOGLE_SHEETS,
          availableForUse: true,
        }),
        buildDestination({
          id: 'unshared',
          title: 'Unshared',
          type: DataDestinationType.GOOGLE_SHEETS,
          availableForUse: false,
        }),
      ]),
    } as unknown as jest.Mocked<ListDataDestinationsService>;

    const facade = createFacade(listDataDestinationsService);

    const result = await facade.listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: [],
    });

    expect(result.destinations.map(d => d.id)).toEqual(['usable', 'unshared']);
    expect(result.destinations.map(d => d.availableForUse)).toEqual([true, false]);
  });

  it('reports the creator as owner, ignoring the unordered owners relation', async () => {
    const listDataDestinationsService = {
      run: jest.fn().mockResolvedValue([
        buildDestination({
          id: 'with-creator',
          title: 'With creator',
          type: DataDestinationType.GOOGLE_SHEETS,
          createdByUser: new UserProjectionDto('creator', 'Creator', 'creator@owox.com'),
          ownerUsers: [new UserProjectionDto('owner', 'Owner', 'owner@owox.com')],
        }),
        buildDestination({
          id: 'no-creator',
          title: 'No creator',
          type: DataDestinationType.GOOGLE_SHEETS,
          createdByUser: null,
          ownerUsers: [new UserProjectionDto('owner', 'Owner', 'owner@owox.com')],
        }),
      ]),
    } as unknown as jest.Mocked<ListDataDestinationsService>;

    const facade = createFacade(listDataDestinationsService);

    const result = await facade.listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: [],
    });

    expect(result.destinations.map(d => d.owner)).toEqual(['creator@owox.com', null]);
  });

  describe('createDestination', () => {
    const baseRequest: AuthorizationContext = {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    };

    // The MCP tool always resolves a display title before calling; this only covers the
    // facade's own defensive backstop for a hypothetical caller that doesn't.
    it('falls back to the raw destination type when no title is given at all', async () => {
      const { facade, createDataDestinationService } = createFacadeForCreate({
        createDataDestinationService: {
          run: jest.fn().mockResolvedValue({ id: 'new-dest', title: 'slack' }),
        },
      });

      await facade.createDestination({
        ...baseRequest,
        type: 'slack',
        emails: ['user@example.com'],
      });

      expect(createDataDestinationService.run).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'slack' })
      );
    });

    it('maps email-based types to email-credentials and starts them unshared', async () => {
      const { facade, createDataDestinationService } = createFacadeForCreate({
        createDataDestinationService: {
          run: jest.fn().mockResolvedValue({ id: 'email-dest', title: 'Marketing Email' }),
        },
      });

      const result = await facade.createDestination({
        ...baseRequest,
        type: 'email',
        title: 'Marketing Email',
        emails: ['ops@example.com', 'alerts@example.com'],
      });

      expect(createDataDestinationService.run).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          userId: 'user-1',
          roles: ['viewer'],
          title: 'Marketing Email',
          type: DataDestinationType.EMAIL,
          credentials: {
            type: 'email-credentials',
            to: ['ops@example.com', 'alerts@example.com'],
          },
          availableForUse: false,
        })
      );
      expect(result).toEqual({
        id: 'email-dest',
        name: 'Marketing Email',
      });
    });

    it.each([
      ['google_sheets', DataDestinationType.GOOGLE_SHEETS],
      ['google_chat', DataDestinationType.GOOGLE_CHAT],
    ] as const)(
      'binds a saved Credential to an unshared %s destination',
      async (type, domainType) => {
        const { facade, createDataDestinationService } = createFacadeForCreate({
          createDataDestinationService: {
            run: jest
              .fn()
              .mockResolvedValue({ id: 'new-dest', title: 'New destination', secret: 'hidden' }),
          },
        });

        const result = await facade.createDestination({
          ...baseRequest,
          type,
          title: 'New destination',
          credentialId: 'credential-1',
        });

        expect(createDataDestinationService.run).toHaveBeenCalledWith(
          expect.objectContaining({
            ...baseRequest,
            type: domainType,
            reusableCredentialId: 'credential-1',
            credentials: undefined,
            availableForUse: false,
          })
        );
        expect(result).toEqual({ id: 'new-dest', name: 'New destination' });
      }
    );

    it('returns a shared creation validation error without acknowledging success', async () => {
      const error = new BadRequestException('Credentials are required.');
      const { facade, createDataDestinationService } = createFacadeForCreate({
        createDataDestinationService: { run: jest.fn().mockRejectedValue(error) },
      });
      await expect(facade.createDestination({ ...baseRequest, type: 'slack' })).rejects.toBe(error);
      expect(createDataDestinationService.run).toHaveBeenCalledWith(
        expect.objectContaining({
          ...baseRequest,
          type: DataDestinationType.SLACK,
          credentials: undefined,
        })
      );
    });

    it('returns the created looker_studio destination without its connector credentials', async () => {
      const { facade, createDataDestinationService } = createFacadeForCreate({
        createDataDestinationService: {
          run: jest.fn().mockResolvedValue({
            id: 'looker-dest',
            title: 'Looker Studio MCP Destination',
            credentialId: 'cred-looker-1',
          }),
        },
      });

      const result = await facade.createDestination({
        ...baseRequest,
        type: 'looker_studio',
        title: 'Looker Studio MCP Destination',
      });

      expect(createDataDestinationService.run).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'looker-dest',
        name: 'Looker Studio MCP Destination',
      });
    });
  });
});

const actor: AuthorizationContext = { projectId: 'project', userId: 'member', roles: ['viewer'] };
function managementFixture() {
  const destination = Object.assign(
    buildDestination({
      id: 'destination',
      title: 'Destination',
      type: DataDestinationType.GOOGLE_SHEETS,
    }),
    {
      ownerUsers: [new UserProjectionDto('owner', 'Owner', 'owner@example.com')],
      contexts: [{ id: 'context', name: 'Finance', icon: null }],
      config: { folderUrl: 'https://drive.google.com/drive/folders/folder', folderId: 'folder' },
      reusableCredential: {
        access: 'visible',
        id: 'credential',
        title: 'Credential',
        definitionId: 'google-sheets-oauth',
        providerName: 'Google',
        identity: 'account@example.com',
        state: 'ready',
        credentials: {
          type: 'google-sheets-oauth-credentials',
          identity: { email: 'account@example.com' },
        },
        secret: 'NEVER_EXPOSE',
      },
    }
  );
  const list = { run: jest.fn().mockResolvedValue([destination]) };
  const create = { run: jest.fn().mockResolvedValue(destination) };
  const get = { run: jest.fn().mockResolvedValue(destination) };
  const update = { run: jest.fn().mockResolvedValue(destination) };
  const impact = {
    run: jest.fn().mockResolvedValue({
      destinationId: 'destination',
      destinationTitle: 'Destination',
      reportsCount: 3,
      dataMartCount: 2,
    }),
  };
  const remove = { run: jest.fn() };
  const rotate = { run: jest.fn().mockResolvedValue({ secret: 'NEVER_EXPOSE' }) };
  const facade = new McpDataDestinationsFacadeImpl(
    list as never,
    create as never,
    get as never,
    update as never,
    impact as never,
    remove as never,
    rotate as never,
    new McpDestinationMapper()
  );
  return { facade, destination, list, create, get, update, impact, remove, rotate };
}

describe('MCP Destination management through shared use cases', () => {
  it('uses shared list visibility and omits secret values and permission hints', async () => {
    const f = managementFixture();
    const result = await f.facade.listDestinations(actor);
    expect(result.destinations[0].owners).toEqual([
      { userId: 'owner', name: 'Owner', email: 'owner@example.com' },
    ]);
    expect(JSON.stringify(result)).not.toContain('NEVER_EXPOSE');
    expect(result.destinations[0]).not.toHaveProperty('permittedActions');
    expect(f.get.run).not.toHaveBeenCalled();
    expect(
      (await f.facade.listDestinations({ ...actor, ownerId: 'unknown' })).destinations
    ).toEqual([]);
  });

  it('returns actual owners and an allowlisted Credential summary', async () => {
    const f = managementFixture();
    const result = await f.facade.getDestination(actor, 'destination');
    expect(result.owners).toEqual([{ userId: 'owner', name: 'Owner', email: 'owner@example.com' }]);
    expect(result.credential).toMatchObject({ id: 'credential', state: 'ready' });
    expect(result.credential).not.toHaveProperty('credentials');
    expect(JSON.stringify(result)).not.toContain('NEVER_EXPOSE');
  });

  it('preserves omitted update fields and normalizes the Drive folder URL', async () => {
    const f = managementFixture();
    f.update.run.mockResolvedValue({ ...f.destination, title: 'Updated by use case' });
    const result = await f.facade.updateDestination(actor, {
      destinationId: 'destination',
      folderUrl: 'https://drive.google.com/drive/folders/new-folder',
    });
    expect(result).toMatchObject({ id: 'destination', name: 'Updated by use case' });
    expect(f.get.run).not.toHaveBeenCalled();
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'destination',
        projectId: actor.projectId,
        userId: actor.userId,
        roles: actor.roles,
        title: undefined,
        credentials: undefined,
        reusableCredentialId: undefined,
        config: {
          folderUrl: 'https://drive.google.com/drive/folders/new-folder',
          folderId: 'new-folder',
        },
      })
    );
  });

  it('maps Google Chat recipients without changing omitted metadata', async () => {
    const f = managementFixture();
    f.update.run.mockResolvedValue({ ...f.destination, type: DataDestinationType.GOOGLE_CHAT });
    await f.facade.updateDestination(actor, {
      destinationId: 'destination',
      emails: ['space@example.com'],
    });
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        title: undefined,
        config: undefined,
        credentials: { type: 'email-credentials', to: ['space@example.com'] },
      })
    );
  });

  it('returns the shared update validation error without reading details', async () => {
    const f = managementFixture();
    const error = new BadRequestException(
      'Only Google Sheets destinations support a Drive folder.'
    );
    f.update.run.mockRejectedValue(error);
    await expect(
      f.facade.updateDestination(actor, { destinationId: 'destination', folderUrl: null })
    ).rejects.toBe(error);
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it('acknowledges access changes without reading details after self-removal', async () => {
    const f = managementFixture();
    await expect(
      f.facade.setDestinationAccess(actor, { destinationId: 'destination', ownerIds: [] })
    ).resolves.toEqual({ id: 'destination', status: 'updated' });
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        title: undefined,
        ownerIds: [],
        contextIds: undefined,
        availableForUse: undefined,
        availableForMaintenance: undefined,
      })
    );
    expect(f.get.run).not.toHaveBeenCalled();
  });

  it('passes actor and project in the shared impact command and returns its result', async () => {
    const f = managementFixture();
    expect(await f.facade.getDestinationImpact(actor, 'destination')).toEqual({
      destinationId: 'destination',
      destinationTitle: 'Destination',
      reportsCount: 3,
      dataMartCount: 2,
    });
    expect(f.impact.run).toHaveBeenCalledWith(
      expect.objectContaining({ ...actor, destinationId: 'destination' })
    );
  });

  it('delegates deletion blockers without acknowledging a failed deletion', async () => {
    const f = managementFixture();
    f.remove.run.mockRejectedValue(new Error('Referenced by reports'));
    await expect(f.facade.deleteDestination(actor, 'destination')).rejects.toThrow(
      'Referenced by reports'
    );
    expect(f.remove.run).toHaveBeenCalledWith(
      expect.objectContaining({ ...actor, id: 'destination' })
    );
  });

  it('calls the shared rotation on each request and never returns its secret', async () => {
    const f = managementFixture();
    for (let i = 0; i < 2; i++) {
      expect(await f.facade.rotateDestinationSecretKey(actor, 'destination')).toEqual({
        id: 'destination',
        status: 'rotated',
      });
    }
    expect(f.rotate.run).toHaveBeenCalledTimes(2);
    expect(f.rotate.run).toHaveBeenCalledWith(
      expect.objectContaining({ ...actor, id: 'destination' })
    );
  });
});
