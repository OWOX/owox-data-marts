import { BadRequestException } from '@nestjs/common';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import { UpdateDataMartOwnersService } from './update-data-mart-owners.service';

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

describe('UpdateDataMartOwnersService', () => {
  const createService = () => {
    const dataMartService = {
      getByIdAndProjectId: jest.fn(),
      save: jest.fn(),
    };

    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
      resolveOwnerUsers: jest.fn().mockReturnValue([]),
    };

    const userProjectionsFetcherService = {
      fetchAllRelevantUserProjections: jest.fn().mockResolvedValue(new UserProjectionsListDto([])),
    };

    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
    };

    const businessOwnerRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const technicalOwnerRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const service = new UpdateDataMartOwnersService(
      dataMartService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      idpProjectionsFacade as never,
      businessOwnerRepository as never,
      technicalOwnerRepository as never
    );

    return {
      service,
      dataMartService,
      mapper,
      userProjectionsFetcherService,
      idpProjectionsFacade,
      businessOwnerRepository,
      technicalOwnerRepository,
    };
  };

  const createDataMart = (overrides: Partial<DataMart> = {}): DataMart => {
    const dm = new DataMart();
    dm.id = 'dm-1';
    dm.projectId = 'proj-1';
    dm.createdById = 'user-1';
    dm.businessOwners = [];
    dm.technicalOwners = [];
    return Object.assign(dm, overrides);
  };

  it('should replace business and technical owners via join tables', async () => {
    const {
      service,
      dataMartService,
      businessOwnerRepository,
      technicalOwnerRepository,
      idpProjectionsFacade,
    } = createService();

    const dataMart = createDataMart();
    dataMartService.getByIdAndProjectId.mockResolvedValue(dataMart);
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', isOutbound: false },
      { userId: 'user-2', isOutbound: false },
    ]);

    const command = new UpdateDataMartOwnersCommand('dm-1', 'proj-1', ['user-1'], ['user-2']);
    await service.run(command);

    // Old owners deleted
    expect(businessOwnerRepository.delete).toHaveBeenCalledWith({ dataMartId: 'dm-1' });
    expect(technicalOwnerRepository.delete).toHaveBeenCalledWith({ dataMartId: 'dm-1' });

    // New owners saved
    expect(businessOwnerRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ dataMartId: 'dm-1', userId: 'user-1' }),
    ]);
    expect(technicalOwnerRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ dataMartId: 'dm-1', userId: 'user-2' }),
    ]);
  });

  it('should reject outbound members', async () => {
    const { service, dataMartService, idpProjectionsFacade } = createService();

    dataMartService.getByIdAndProjectId.mockResolvedValue(createDataMart());
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', isOutbound: true },
    ]);

    const command = new UpdateDataMartOwnersCommand('dm-1', 'proj-1', ['user-1'], []);
    await expect(service.run(command)).rejects.toThrow(BadRequestException);
  });

  it('should reject non-project-members', async () => {
    const { service, dataMartService, idpProjectionsFacade } = createService();

    dataMartService.getByIdAndProjectId.mockResolvedValue(createDataMart());
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'other-user', isOutbound: false },
    ]);

    const command = new UpdateDataMartOwnersCommand('dm-1', 'proj-1', [], ['user-1']);
    await expect(service.run(command)).rejects.toThrow(BadRequestException);
  });

  it('should allow empty owner lists', async () => {
    const {
      service,
      dataMartService,
      businessOwnerRepository,
      technicalOwnerRepository,
      idpProjectionsFacade,
    } = createService();

    dataMartService.getByIdAndProjectId.mockResolvedValue(createDataMart());
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([]);

    const command = new UpdateDataMartOwnersCommand('dm-1', 'proj-1', [], []);
    await service.run(command);

    expect(businessOwnerRepository.delete).toHaveBeenCalledWith({ dataMartId: 'dm-1' });
    expect(technicalOwnerRepository.delete).toHaveBeenCalledWith({ dataMartId: 'dm-1' });
    // syncOwners skips save when there are no owners to save
    expect(businessOwnerRepository.save).not.toHaveBeenCalled();
    expect(technicalOwnerRepository.save).not.toHaveBeenCalled();
  });

  it('should deduplicate owner IDs before validation', async () => {
    const { service, dataMartService, idpProjectionsFacade } = createService();

    dataMartService.getByIdAndProjectId.mockResolvedValue(createDataMart());
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', isOutbound: false },
    ]);

    // Same user in both business and technical owners
    const command = new UpdateDataMartOwnersCommand('dm-1', 'proj-1', ['user-1'], ['user-1']);
    await service.run(command);

    // syncOwners is called once per owner type, so getProjectMembers is called twice
    expect(idpProjectionsFacade.getProjectMembers).toHaveBeenCalledTimes(2);
  });

  it('should reload data mart with owners after update and return DTO', async () => {
    const {
      service,
      dataMartService,
      mapper,
      userProjectionsFetcherService,
      idpProjectionsFacade,
    } = createService();

    const updatedDm = createDataMart({
      technicalOwners: [{ dataMartId: 'dm-1', userId: 'user-2' } as DataMartTechnicalOwner],
      businessOwners: [{ dataMartId: 'dm-1', userId: 'user-1' } as DataMartBusinessOwner],
    });

    dataMartService.getByIdAndProjectId
      .mockResolvedValueOnce(createDataMart()) // initial load
      .mockResolvedValueOnce(updatedDm); // reload after update

    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', isOutbound: false },
      { userId: 'user-2', isOutbound: false },
    ]);

    const projection1 = new UserProjectionDto('user-1', 'Alice', 'alice@test.com', null);
    const projection2 = new UserProjectionDto('user-2', 'Bob', 'bob@test.com', null);
    userProjectionsFetcherService.fetchAllRelevantUserProjections.mockResolvedValue(
      new UserProjectionsListDto([projection1, projection2])
    );

    const command = new UpdateDataMartOwnersCommand('dm-1', 'proj-1', ['user-1'], ['user-2']);
    await service.run(command);

    // Should reload data mart to get fresh owners
    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledTimes(2);
    expect(mapper.toDomainDto).toHaveBeenCalled();
  });
});
