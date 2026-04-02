import { BadRequestException } from '@nestjs/common';
import { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';
import { syncOwners } from './sync-owners';

describe('syncOwners', () => {
  const entityIdField = 'dataMartId';
  const entityId = 'dm-1';
  const projectId = 'proj-1';

  const createMocks = () => {
    const repository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const idpProjectionsFacade = {
      getProjectMembers: jest.fn().mockResolvedValue([]),
    };

    const createOwner = (userId: string) => ({ dataMartId: entityId, userId });

    return { repository, idpProjectionsFacade, createOwner };
  };

  const makeMember = (userId: string, isOutbound = false): ProjectMemberDto =>
    new ProjectMemberDto(
      userId,
      `${userId}@test.com`,
      userId,
      undefined,
      'member',
      false,
      isOutbound
    );

  it('should delete existing owners, skip save and skip validation when ownerIds is empty', async () => {
    const { repository, idpProjectionsFacade, createOwner } = createMocks();

    await syncOwners(
      repository as never,
      entityIdField,
      entityId,
      projectId,
      [],
      idpProjectionsFacade as never,
      createOwner
    );

    expect(repository.delete).toHaveBeenCalledWith({ dataMartId: entityId });
    expect(repository.save).not.toHaveBeenCalled();
    expect(idpProjectionsFacade.getProjectMembers).not.toHaveBeenCalled();
  });

  it('should validate members, delete old owners, and save new owners for valid ownerIds', async () => {
    const { repository, idpProjectionsFacade, createOwner } = createMocks();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      makeMember('user-1'),
      makeMember('user-2'),
    ]);

    await syncOwners(
      repository as never,
      entityIdField,
      entityId,
      projectId,
      ['user-1', 'user-2'],
      idpProjectionsFacade as never,
      createOwner
    );

    expect(idpProjectionsFacade.getProjectMembers).toHaveBeenCalledWith(projectId);
    expect(repository.delete).toHaveBeenCalledWith({ dataMartId: entityId });
    expect(repository.save).toHaveBeenCalledWith([
      { dataMartId: entityId, userId: 'user-1' },
      { dataMartId: entityId, userId: 'user-2' },
    ]);
  });

  it('should deduplicate ownerIds before saving', async () => {
    const { repository, idpProjectionsFacade, createOwner } = createMocks();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([makeMember('user-1')]);

    await syncOwners(
      repository as never,
      entityIdField,
      entityId,
      projectId,
      ['user-1', 'user-1', 'user-1'],
      idpProjectionsFacade as never,
      createOwner
    );

    expect(repository.save).toHaveBeenCalledWith([{ dataMartId: entityId, userId: 'user-1' }]);
  });

  it('should throw BadRequestException for a non-member userId', async () => {
    const { repository, idpProjectionsFacade, createOwner } = createMocks();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([makeMember('user-1')]);

    await expect(
      syncOwners(
        repository as never,
        entityIdField,
        entityId,
        projectId,
        ['unknown-user'],
        idpProjectionsFacade as never,
        createOwner
      )
    ).rejects.toThrow(BadRequestException);

    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException for an outbound member', async () => {
    const { repository, idpProjectionsFacade, createOwner } = createMocks();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([makeMember('user-1', true)]);

    await expect(
      syncOwners(
        repository as never,
        entityIdField,
        entityId,
        projectId,
        ['user-1'],
        idpProjectionsFacade as never,
        createOwner
      )
    ).rejects.toThrow(BadRequestException);

    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when mixing valid and invalid ownerIds', async () => {
    const { repository, idpProjectionsFacade, createOwner } = createMocks();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([makeMember('user-1')]);

    await expect(
      syncOwners(
        repository as never,
        entityIdField,
        entityId,
        projectId,
        ['user-1', 'invalid-user'],
        idpProjectionsFacade as never,
        createOwner
      )
    ).rejects.toThrow(BadRequestException);

    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
