import { PluginCredentialBindingReconciliationService } from './plugin-credential-binding-reconciliation.service';

describe('PluginCredentialBindingReconciliationService', () => {
  it('reconciles active installations in bounded batches', async () => {
    const installations = {
      listActiveByPluginIdAfter: jest
        .fn()
        .mockResolvedValue([{ id: 'installation-1' }, { id: 'installation-2' }]),
    };
    const bindings = { reconcileBindings: jest.fn().mockResolvedValue(undefined) };
    const service = new PluginCredentialBindingReconciliationService(
      installations as never,
      bindings as never
    );

    await service.reconcile('plugin-1', ['github']);

    expect(installations.listActiveByPluginIdAfter).toHaveBeenCalledWith('plugin-1', null, 500);
    expect(bindings.reconcileBindings).toHaveBeenCalledWith({
      consumerType: 'plugin-installation',
      consumerIds: ['installation-1', 'installation-2'],
      requirements: ['github'],
    });
  });
});
