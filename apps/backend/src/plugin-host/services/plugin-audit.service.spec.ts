import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { PluginAuditEvent } from '../entities/plugin-audit-event.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginAuditService } from './plugin-audit.service';
import { Repository } from 'typeorm';

function setup() {
  const repository = {
    create: jest.fn(row => row),
    save: jest.fn(row => Promise.resolve({ id: 'a1', ...row })),
  } as unknown as jest.Mocked<Repository<PluginAuditEvent>>;

  const dispatcher = {
    publishOnCommit: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OwoxEventDispatcher>;

  return { service: new PluginAuditService(repository, dispatcher), repository, dispatcher };
}

const record = {
  pluginId: 'p1',
  action: PluginAuditAction.PUBLISH,
  authorityScope: PluginPublicationScope.DEPLOYMENT,
  projectId: 'j1',
  userId: 'u1',
  apiKeyId: 'key-1',
  beforeState: { isActive: false },
  afterState: { isActive: true },
};

describe('PluginAuditService', () => {
  it('persists actor, authority, context and before/after state', async () => {
    const { service, repository } = setup();

    await service.record(record);

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining(record));
  });

  it('publishes the integration event alongside the row', async () => {
    const { service, dispatcher } = setup();

    await service.record(record);

    expect(dispatcher.publishOnCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ pluginId: 'p1', action: PluginAuditAction.PUBLISH }),
      })
    );
  });

  // The row is the durable record; the external bus is often unconfigured on
  // self-managed deployments and must never be able to lose an audit entry.
  it('keeps the audit row when the event bus rejects', async () => {
    const { service, repository, dispatcher } = setup();
    (dispatcher.publishOnCommit as jest.Mock).mockRejectedValue(new Error('no producer'));

    await expect(service.record(record)).resolves.toBeUndefined();
    expect(repository.save).toHaveBeenCalled();
  });

  it('does not leak state into the outbound event', async () => {
    const { service, dispatcher } = setup();

    await service.record(record);

    const [event] = (dispatcher.publishOnCommit as jest.Mock).mock.calls[0];
    expect(event.payload).not.toHaveProperty('beforeState');
    expect(event.payload).not.toHaveProperty('afterState');
  });

  it('accepts an action with no project or member behind it', async () => {
    const { service, repository } = setup();

    await service.record({
      pluginId: 'p1',
      action: PluginAuditAction.SUSPEND,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      apiKeyId: 'key-1',
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null, userId: null })
    );
  });
});
