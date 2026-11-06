import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { Action, EntityType } from '../services/access-decision';
import { GetDataMartService } from './get-data-mart.service';

describe('GetDataMartService', () => {
  const legacyId = '0123456789abcdef0123456789abcdef';
  const actor = { projectId: 'project', userId: 'member', roles: ['viewer'] };

  function setup() {
    let stored: { id: string; projectId: string; title: string; createdById: string } | undefined =
      {
        id: legacyId,
        projectId: actor.projectId,
        title: 'Stored title',
        createdById: 'owner',
      };
    const dataMarts = {
      getByIdAndProjectId: jest.fn(async (id: string, projectId: string) => {
        if (!stored || stored.id !== id || stored.projectId !== projectId) {
          throw new NotFoundException('Data Mart not found');
        }
        return stored;
      }),
    };
    const legacySync = {
      run: jest.fn(async () => {
        stored = {
          id: legacyId,
          projectId: actor.projectId,
          title: 'Synced title',
          createdById: 'owner',
        };
      }),
    };
    const access = { canAccess: jest.fn().mockResolvedValue(true) };
    const projections = {
      fetchAllRelevantUserProjections: jest
        .fn()
        .mockResolvedValue({ getByUserId: () => undefined }),
    };
    const service = new GetDataMartService(
      dataMarts as never,
      projections as never,
      { toDomainDto: (dataMart: object) => ({ ...dataMart }) } as never,
      { isDataMartIdLooksLikeLegacy: (id: string) => id === legacyId } as never,
      legacySync as never,
      access as never
    );
    return {
      service,
      dataMarts,
      legacySync,
      access,
      projections,
      removeStored: () => {
        stored = undefined;
      },
    };
  }

  it('reads the stored legacy title without synchronizing when legacy sync is disabled', async () => {
    const { service, legacySync } = setup();

    await expect(
      service.run(
        new GetDataMartCommand(legacyId, actor.projectId, actor.userId, actor.roles, true)
      )
    ).resolves.toMatchObject({ id: legacyId, title: 'Stored title' });
    expect(legacySync.run).not.toHaveBeenCalled();
  });

  it('keeps legacy synchronization enabled for existing callers', async () => {
    const { service, legacySync } = setup();

    await expect(
      service.run(new GetDataMartCommand(legacyId, actor.projectId, actor.userId, actor.roles))
    ).resolves.toMatchObject({ id: legacyId, title: 'Synced title' });
    expect(legacySync.run).toHaveBeenCalledWith({ dataMartId: legacyId });
  });

  it('requires SEE access without synchronizing a stored-only read', async () => {
    const { service, legacySync, access, projections } = setup();
    access.canAccess.mockResolvedValue(false);

    await expect(
      service.run(
        new GetDataMartCommand(legacyId, actor.projectId, actor.userId, actor.roles, true)
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.canAccess).toHaveBeenCalledWith(
      actor.userId,
      actor.roles,
      EntityType.DATA_MART,
      legacyId,
      Action.SEE,
      actor.projectId
    );
    expect(legacySync.run).not.toHaveBeenCalled();
    expect(projections.fetchAllRelevantUserProjections).not.toHaveBeenCalled();
  });

  it('keeps the project boundary for a stored-only read', async () => {
    const { service, legacySync, dataMarts, access } = setup();

    await expect(
      service.run(
        new GetDataMartCommand(legacyId, 'other-project', actor.userId, actor.roles, true)
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dataMarts.getByIdAndProjectId).toHaveBeenCalledWith(legacyId, 'other-project');
    expect(legacySync.run).not.toHaveBeenCalled();
    expect(access.canAccess).not.toHaveBeenCalled();
  });

  it('does not import a missing legacy Data Mart during a stored-only read', async () => {
    const { service, legacySync, removeStored } = setup();
    removeStored();

    await expect(
      service.run(
        new GetDataMartCommand(legacyId, actor.projectId, actor.userId, actor.roles, true)
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(legacySync.run).not.toHaveBeenCalled();
  });
});
