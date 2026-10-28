jest.mock('../use-cases/list-data-destinations.service', () => ({
  ListDataDestinationsService: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import type { DestinationCredentialSummary } from '../data-destination-types/destination-credential-state';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { McpDataDestinationsFacadeImpl } from './mcp-data-destinations.facade.impl';

function createFacade(
  listDataDestinationsService: Pick<ListDataDestinationsService, 'run'>
): McpDataDestinationsFacadeImpl {
  return new McpDataDestinationsFacadeImpl(
    listDataDestinationsService as unknown as ListDataDestinationsService,
    {} as unknown as CreateDataDestinationService
  );
}

function createFacadeForCreate(
  overrides: {
    createDataDestinationService?: Pick<CreateDataDestinationService, 'run'>;
  } = {}
): {
  facade: McpDataDestinationsFacadeImpl;
  createDataDestinationService: any;
} {
  const createDataDestinationService = {
    run: jest.fn(),
    ...overrides.createDataDestinationService,
  };
  return {
    facade: new McpDataDestinationsFacadeImpl(
      {} as unknown as ListDataDestinationsService,
      createDataDestinationService as unknown as CreateDataDestinationService
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
    overrides.availableForUse ?? true
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
    expect(result).toEqual({
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

  it('includes destinations that are not yet available for use, without exposing sharing status', async () => {
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

    // Unshared destinations are still surfaced (not filtered out), but the MCP response
    // never reports availableForUse — that's a UI/REST concern, not an MCP one.
    expect(result.destinations.map(d => d.id)).toEqual(['usable', 'unshared']);
    expect(result.destinations.every(d => !('availableForUse' in d))).toBe(true);
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
    const baseRequest = {
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

    it('rejects google_sheets with a clear error instead of falling into the email-credentials branch', async () => {
      const { facade, createDataDestinationService } = createFacadeForCreate();

      await expect(
        facade.createDestination({
          ...baseRequest,
          type: 'google_sheets',
        })
      ).rejects.toThrow(
        'google_sheets destinations cannot be created directly; use the OAuth connect flow instead'
      );
      expect(createDataDestinationService.run).not.toHaveBeenCalled();
    });

    it('rejects direct creation when emails are missing for non-looker types', async () => {
      const { facade, createDataDestinationService } = createFacadeForCreate();

      await expect(
        facade.createDestination({
          ...baseRequest,
          type: 'slack',
          title: 'Ops Slack',
        })
      ).rejects.toThrow(
        new BadRequestException('Emails list is required for direct destination creation')
      );

      expect(createDataDestinationService.run).not.toHaveBeenCalled();
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
