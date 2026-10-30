import type { AuthorizationContext } from '../../../idp';
import { Action, EntityType } from '../../services/access-decision';
import { BadRequestException } from '@nestjs/common';
import { CredentialDefinitionUnavailableException } from '../services/credential-definition.service';
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

  describe('a Credential whose definition no longer resolves', () => {
    const context = { projectId: 'p1', userId: 'm1', roles: ['editor'] } as AuthorizationContext;
    const at = new Date('2026-01-01');
    const good = { id: 'good' };
    const orphan = {
      id: 'orphan',
      projectId: 'p1',
      title: 'Old key',
      definitionId: 'gone',
      encryptedSecret: 'secret',
      publicMetadata: { clientEmail: 'a@b.c' },
      createdAt: at,
      modifiedAt: at,
    };
    const make = (build: jest.Mock) =>
      new ListCredentialsService(
        { listByProjectId: async () => [good, orphan], listBindingsOf: async () => [] } as never,
        {
          canAccessMany: async () =>
            new Map([
              ['good', true],
              ['orphan', true],
            ]),
        } as never,
        { build } as never,
        { visibleTitles: async () => new Map() } as never
      );

    it('lists it as unavailable next to the resolving row', async () => {
      const build = jest.fn(async (credential: { id: string }) => {
        if (credential.id === 'orphan') {
          throw new CredentialDefinitionUnavailableException(
            'Credential definition gone is not available'
          );
        }
        return credential;
      });

      await expect(make(build).run(context)).resolves.toEqual([
        good,
        {
          id: 'orphan',
          projectId: 'p1',
          title: 'Old key',
          definitionId: 'gone',
          state: 'unavailable',
          createdAt: at,
          modifiedAt: at,
        },
      ]);
    });

    it('still fails the list on an unrelated rejection', async () => {
      const build = jest.fn(async (credential: { id: string }) => {
        if (credential.id === 'orphan') throw new BadRequestException('unrelated');
        return credential;
      });

      await expect(make(build).run(context)).rejects.toThrow('unrelated');
    });
  });
});
