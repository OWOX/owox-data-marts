import { In, type Repository } from 'typeorm';
import { PluginCollectionAuditEvent } from '../entities/plugin-collection-audit-event.collection.entity';
import { PluginCollectionAuditService } from './plugin-collection-audit.service';

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

describe('PluginCollectionAuditService retention', () => {
  it('removes the oldest row before a capped scope grows further', async () => {
    const repository = {
      countBy: jest.fn().mockResolvedValue(50_000),
      find: jest.fn().mockResolvedValue([{ id: 'oldest' }]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<PluginCollectionAuditEvent>>;
    const service = new PluginCollectionAuditService(repository);

    await (
      service as unknown as {
        trimOldest(where: { pluginId: string; projectId: string }, limit: number): Promise<void>;
      }
    ).trimOldest({ pluginId: 'plugin-1', projectId: 'project-1' }, 50_000);

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        order: { createdAt: 'ASC', id: 'ASC' },
      })
    );
    expect(repository.delete).toHaveBeenCalledWith({ id: expect.anything() });
  });

  it('deletes expired rows by id, not by a date range', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([{ id: 'expired-1' }, { id: 'expired-2' }]),
      countBy: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
      create: jest.fn((row: unknown) => row),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Repository<PluginCollectionAuditEvent>>;
    const service = new PluginCollectionAuditService(repository);

    await service.record(
      {
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
        pluginId: 'plugin-1',
        installationId: 'installation-1',
      },
      { collectionName: 'grid-columns', action: 'PUT', outcome: 'SUCCESS' }
    );

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
        where: { projectId: 'project-1', createdAt: expect.anything() },
        take: 1_000,
      })
    );
    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(repository.delete).toHaveBeenCalledWith({ id: In(['expired-1', 'expired-2']) });
  });
});
