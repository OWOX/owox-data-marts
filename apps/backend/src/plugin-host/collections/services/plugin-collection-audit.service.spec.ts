import type { Repository } from 'typeorm';
import { PluginCollectionAuditEvent } from '../entities/plugin-collection-audit-event.collection.entity';
import { PluginCollectionAuditService } from './plugin-collection-audit.service';

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
});
