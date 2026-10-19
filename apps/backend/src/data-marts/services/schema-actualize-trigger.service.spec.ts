jest.mock('../../idp/facades/idp-projections.facade', () => ({ IdpProjectionsFacade: jest.fn() }));
import { ForbiddenException } from '@nestjs/common';
import { SchemaActualizeTriggerService } from './schema-actualize-trigger.service';
import { Action, EntityType } from './access-decision';

describe('Schema actualization enqueue authority', () => {
  function setup() {
    const repository = {
      save: jest.fn().mockImplementation(async trigger => ({ ...trigger, id: 'queued' })),
    };
    const marts = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'mart', storage: { id: 'storage' } }),
    };
    const idp = {
      getProjectForUser: jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] }),
    };
    const access = { canAccess: jest.fn().mockResolvedValue(true) };
    const service = new SchemaActualizeTriggerService(
      repository as any,
      marts as any,
      access as any,
      idp as any
    );
    return { repository, service, idp, access };
  }

  it('queues an actor-bound refresh after both permissions are checked', async () => {
    const { repository, service, access } = setup();
    expect(await service.createTrigger('user', 'project', 'mart')).toBe('queued');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user', projectId: 'project', dataMartId: 'mart' })
    );
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'mart',
      Action.EDIT,
      'project'
    );
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.STORAGE,
      'storage',
      Action.USE,
      'project'
    );
  });

  it.each([EntityType.DATA_MART, EntityType.STORAGE])(
    'does not enqueue when %s permission is denied',
    async denied => {
      const { repository, service, access } = setup();
      access.canAccess.mockImplementation(async (_user, _roles, type) => type !== denied);
      await expect(service.createTrigger('user', 'project', 'mart')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(repository.save).not.toHaveBeenCalled();
    }
  );

  it.each(['missing actor', 'missing membership', 'wrong project'])(
    'does not enqueue for %s',
    async reason => {
      const { repository, service, idp } = setup();
      if (reason === 'missing membership') idp.getProjectForUser.mockResolvedValue(undefined);
      if (reason === 'wrong project')
        idp.getProjectForUser.mockResolvedValue({ id: 'other', roles: ['admin'] });
      await expect(
        service.createTrigger(reason === 'missing actor' ? '' : 'user', 'project', 'mart')
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.save).not.toHaveBeenCalled();
    }
  );
});
