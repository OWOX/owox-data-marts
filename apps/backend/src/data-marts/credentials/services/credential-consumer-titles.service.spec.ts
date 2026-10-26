import type { AuthorizationContext } from '../../../idp';
import { CredentialConsumerTitlesService } from './credential-consumer-titles.service';

const context = { projectId: 'p1', userId: 'member-1', roles: ['editor'] } as AuthorizationContext;

describe('CredentialConsumerTitlesService', () => {
  it('asks each registered consumer type once, for its own consumers', async () => {
    const service = new CredentialConsumerTitlesService();
    const storages = jest.fn().mockResolvedValue(new Map([['s1', 'Warehouse']]));
    const installations = jest.fn().mockResolvedValue(new Map([['i1', 'Slack digest']]));
    service.register('storage', storages);
    service.register('plugin-installation', installations);

    const titles = await service.visibleTitles(context, [
      { consumerType: 'storage', consumerId: 's1' },
      { consumerType: 'plugin-installation', consumerId: 'i1' },
      { consumerType: 'storage', consumerId: 's2' },
      { consumerType: 'storage', consumerId: 's1' },
    ]);

    expect(storages).toHaveBeenCalledTimes(1);
    expect(storages).toHaveBeenCalledWith(context, ['s1', 's2']);
    expect(installations).toHaveBeenCalledWith(context, ['i1']);
    expect(titles.get('storage')).toEqual(new Map([['s1', 'Warehouse']]));
    expect(titles.get('plugin-installation')).toEqual(new Map([['i1', 'Slack digest']]));
  });

  it('leaves a consumer type nobody registered untitled and asks no one without consumers', async () => {
    const service = new CredentialConsumerTitlesService();
    const storages = jest.fn().mockResolvedValue(new Map());
    service.register('storage', storages);

    const titles = await service.visibleTitles(context, [
      { consumerType: 'plugin-installation', consumerId: 'i1' },
    ]);

    expect(titles.size).toBe(0);
    expect(storages).not.toHaveBeenCalled();
  });
});
