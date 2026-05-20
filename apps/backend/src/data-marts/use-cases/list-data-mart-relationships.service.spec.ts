jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ListDataMartRelationshipsService } from './list-data-mart-relationships.service';
import { ListRelationshipsCommand } from '../dto/domain/list-relationships.command';
import { EntityType, Action } from '../services/access-decision';

describe('ListDataMartRelationshipsService', () => {
  const relationships = [
    { id: 'rel-1', sourceDataMart: { id: 'dm-1' }, targetDataMart: { id: 'dm-2' } },
    { id: 'rel-2', sourceDataMart: { id: 'dm-1' }, targetDataMart: { id: 'dm-3' } },
  ];

  const createService = (canAccess = true) => {
    const relationshipService = {
      findBySourceDataMartId: jest.fn().mockResolvedValue(relationships),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-1' }),
    };
    const mapper = {
      toDomainDtoList: jest.fn().mockReturnValue([{ id: 'rel-1' }, { id: 'rel-2' }]),
    };
    const userProjectionsFetcherService = {
      fetchRelevantUserProjections: jest.fn().mockResolvedValue([]),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new ListDataMartRelationshipsService(
      relationshipService as never,
      dataMartService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      accessDecisionService as never
    );

    return { service, relationshipService, dataMartService, accessDecisionService, mapper };
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists relationships when user has SEE access on DataMart', async () => {
    const { service, relationshipService, accessDecisionService } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      'dm-1',
      Action.SEE,
      'proj-1'
    );
    expect(relationshipService.findBySourceDataMartId).toHaveBeenCalledWith('dm-1');
    expect(result).toHaveLength(2);
  });

  it('passes accessByDmId map with per-DM flags to mapper', async () => {
    const { service, mapper } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await service.run(command);

    const [, , accessByDmId] = mapper.toDomainDtoList.mock.calls[0] as [
      unknown,
      unknown,
      Map<string, { canSee: boolean; canUse: boolean; canEdit: boolean }>,
    ];
    expect(accessByDmId).toBeInstanceOf(Map);
    expect(accessByDmId.has('dm-1')).toBe(true);
    expect(accessByDmId.has('dm-2')).toBe(true);
    expect(accessByDmId.has('dm-3')).toBe(true);
    expect(accessByDmId.get('dm-1')).toEqual({ canSee: true, canUse: true, canEdit: true });
  });

  it('passes per-DM asymmetric access flags from AccessDecisionService to mapper', async () => {
    const { service, accessDecisionService, mapper } = createService(true);

    accessDecisionService.canAccess.mockImplementation(
      (_userId: string, _roles: string[], _entityType: string, dmId: string, action: string) => {
        if (dmId === 'dm-2' && action !== Action.SEE) return Promise.resolve(false);
        if (dmId === 'dm-3' && action !== Action.SEE) return Promise.resolve(false);
        return Promise.resolve(true);
      }
    );

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await service.run(command);

    const [, , accessByDmId] = mapper.toDomainDtoList.mock.calls[0] as [
      unknown,
      unknown,
      Map<string, { canSee: boolean; canUse: boolean; canEdit: boolean }>,
    ];
    expect(accessByDmId.get('dm-1')).toEqual({ canSee: true, canUse: true, canEdit: true });
    expect(accessByDmId.get('dm-2')).toEqual({ canSee: true, canUse: false, canEdit: false });
  });

  it('throws ForbiddenException when user lacks SEE on DataMart', async () => {
    const { service } = createService(false);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, dataMartService } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('performs project-scope check via dataMartService before the access check', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await service.run(command);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'proj-1');
    const lookupOrder = dataMartService.getByIdAndProjectId.mock.invocationCallOrder[0];
    const accessOrder = accessDecisionService.canAccess.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(accessOrder);
  });

  it('does not call canAccess when the project-scope lookup fails', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(new NotFoundException('not found'));

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
