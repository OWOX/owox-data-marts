import type { AuthorizationContext } from '../../../idp';
import { Action, EntityType } from '../../services/access-decision';
import { ListCredentialsService } from './list-credentials.service';

describe('ListCredentialsService', () => {
  it('decides USE, bindings and consumer titles for the visible Credentials in one batch each', async () => {
    const context = { projectId: 'p1', userId: 'm1', roles: ['editor'] } as AuthorizationContext;
    const visible = { id: 'visible' };
    const usable = { id: 'usable' };
    const hidden = { id: 'hidden' };
    const decisions: Record<string, Map<string, boolean>> = {
      [Action.SEE]: new Map([
        ['visible', true],
        ['usable', true],
        ['hidden', false],
      ]),
      [Action.USE]: new Map([
        ['visible', false],
        ['usable', true],
        ['hidden', false],
      ]),
    };
    const access = {
      canAccessMany: jest.fn(async (...args: unknown[]) => decisions[args[4] as string]),
    };
    const visibleBinding = { credentialId: 'visible', consumerType: 'storage', consumerId: 's1' };
    const usableBinding = { credentialId: 'usable', consumerType: 'storage', consumerId: 's2' };
    const credentials = {
      listByProjectId: jest.fn().mockResolvedValue([visible, usable, hidden]),
      listBindingsOf: jest.fn().mockResolvedValue([visibleBinding, usableBinding]),
    };
    const titles = new Map([['storage', new Map([['s2', 'Warehouse']])]]);
    const consumerTitles = { visibleTitles: jest.fn().mockResolvedValue(titles) };
    const view = { build: jest.fn(async (credential: { id: string }) => credential) };
    const service = new ListCredentialsService(
      credentials as never,
      access as never,
      view as never,
      consumerTitles as never
    );

    await expect(service.run(context)).resolves.toEqual([visible, usable]);

    expect(access.canAccessMany).toHaveBeenCalledTimes(2);
    expect(access.canAccessMany).toHaveBeenCalledWith(
      'm1',
      ['editor'],
      EntityType.CREDENTIAL,
      ['visible', 'usable'],
      Action.USE,
      'p1'
    );
    expect(credentials.listBindingsOf).toHaveBeenCalledWith(['visible', 'usable']);
    expect(consumerTitles.visibleTitles).toHaveBeenCalledTimes(1);
    expect(consumerTitles.visibleTitles).toHaveBeenCalledWith(context, [
      visibleBinding,
      usableBinding,
    ]);
    expect(view.build.mock.calls).toEqual([
      [visible, context, undefined, { canUse: false, bindings: [visibleBinding], titles }],
      [usable, context, undefined, { canUse: true, bindings: [usableBinding], titles }],
    ]);
  });
});
