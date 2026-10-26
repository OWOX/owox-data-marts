import type { AuthorizationContext } from '../../../idp';
import { Action, EntityType } from '../../services/access-decision';
import { CredentialViewService } from './credential-view.service';

function setup() {
  const definition = { definitionId: 'github' };
  const bindings = [{ consumerType: 'storage', consumerId: 'storage-1' }];
  const titles = new Map([['storage', new Map([['storage-1', 'Warehouse']])]]);
  const access = {
    canAccessMany: jest.fn().mockResolvedValue(new Map([['credential-1', false]])),
  };
  const credentials = {
    listBindings: jest.fn().mockResolvedValue(bindings),
    getLastUsedAt: jest.fn().mockResolvedValue(null),
  };
  const consumerTitles = { visibleTitles: jest.fn().mockResolvedValue(titles) };
  const mapper = { toDto: jest.fn().mockResolvedValue({ id: 'credential-1' }) };
  const view = new CredentialViewService(
    { getForView: jest.fn().mockResolvedValue(definition) } as never,
    credentials as never,
    mapper as never,
    access as never,
    consumerTitles as never
  );
  return { view, definition, bindings, titles, access, credentials, consumerTitles, mapper };
}

describe('CredentialViewService', () => {
  it('decides USE and the visible consumer titles for the viewing member', async () => {
    const context = {
      projectId: 'project-1',
      userId: 'member-1',
      roles: ['viewer'],
    } as AuthorizationContext;
    const state = setup();
    const credential = { id: 'credential-1' };

    await state.view.build(credential as never, context);

    expect(state.access.canAccessMany).toHaveBeenCalledWith(
      'member-1',
      ['viewer'],
      EntityType.CREDENTIAL,
      ['credential-1'],
      Action.USE,
      'project-1'
    );
    expect(state.consumerTitles.visibleTitles).toHaveBeenCalledWith(context, state.bindings);
    expect(state.mapper.toDto).toHaveBeenCalledWith(
      credential,
      state.definition,
      state.bindings,
      null,
      false,
      state.titles,
      undefined
    );
  });

  it('uses what a list already decided for every row', async () => {
    const state = setup();
    const batch = {
      canUse: true,
      bindings: [{ consumerType: 'storage', consumerId: 'storage-2' }],
      titles: new Map(),
    };

    await state.view.build(
      { id: 'credential-1' } as never,
      {} as AuthorizationContext,
      undefined,
      batch as never
    );

    expect(state.access.canAccessMany).not.toHaveBeenCalled();
    expect(state.credentials.listBindings).not.toHaveBeenCalled();
    expect(state.consumerTitles.visibleTitles).not.toHaveBeenCalled();
    expect(state.mapper.toDto).toHaveBeenCalledWith(
      { id: 'credential-1' },
      state.definition,
      batch.bindings,
      null,
      true,
      batch.titles,
      undefined
    );
  });
});
