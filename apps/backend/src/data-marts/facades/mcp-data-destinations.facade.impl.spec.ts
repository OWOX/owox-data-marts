jest.mock('../use-cases/list-data-destinations.service', () => ({
  ListDataDestinationsService: jest.fn(),
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationDto } from '../dto/domain/data-destination.dto';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import type { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { McpDataDestinationsFacadeImpl } from './mcp-data-destinations.facade.impl';

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

    const facade = new McpDataDestinationsFacadeImpl(listDataDestinationsService);

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
        { id: 'dest_1', name: 'Marketing Sheet', type: 'google_sheets', owner: 'ann@owox.com' },
        { id: 'dest_2', name: 'Ops Teams', type: 'teams', owner: null },
      ],
    });
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

    const facade = new McpDataDestinationsFacadeImpl(listDataDestinationsService);

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

  it('filters out destinations that are not available for use', async () => {
    const listDataDestinationsService = {
      run: jest.fn().mockResolvedValue([
        buildDestination({
          id: 'usable',
          title: 'Usable',
          type: DataDestinationType.GOOGLE_SHEETS,
          availableForUse: true,
        }),
        buildDestination({
          id: 'broken',
          title: 'Broken',
          type: DataDestinationType.GOOGLE_SHEETS,
          availableForUse: false,
        }),
      ]),
    } as unknown as jest.Mocked<ListDataDestinationsService>;

    const facade = new McpDataDestinationsFacadeImpl(listDataDestinationsService);

    const result = await facade.listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: [],
    });

    expect(result.destinations.map(d => d.id)).toEqual(['usable']);
  });

  it('prefers an assigned owner over the creator, falling back to the creator', async () => {
    const listDataDestinationsService = {
      run: jest.fn().mockResolvedValue([
        buildDestination({
          id: 'owned',
          title: 'Owned',
          type: DataDestinationType.GOOGLE_SHEETS,
          createdByUser: new UserProjectionDto('creator', 'Creator', 'creator@owox.com'),
          ownerUsers: [new UserProjectionDto('owner', 'Owner', 'owner@owox.com')],
        }),
        buildDestination({
          id: 'creator-only',
          title: 'Creator only',
          type: DataDestinationType.GOOGLE_SHEETS,
          createdByUser: new UserProjectionDto('creator', 'Creator', 'creator@owox.com'),
        }),
      ]),
    } as unknown as jest.Mocked<ListDataDestinationsService>;

    const facade = new McpDataDestinationsFacadeImpl(listDataDestinationsService);

    const result = await facade.listDestinations({
      projectId: 'project-1',
      userId: 'user-1',
      roles: [],
    });

    expect(result.destinations.map(d => d.owner)).toEqual(['owner@owox.com', 'creator@owox.com']);
  });
});
