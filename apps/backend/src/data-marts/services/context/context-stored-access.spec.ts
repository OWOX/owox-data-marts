jest.mock('../data-mart.service', () => ({ DataMartService: jest.fn() }));
jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));
jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
import { AccessDecisionService } from '../access-decision/access-decision.service';
import { ContextAccessService } from './context-access.service';
import { Action, EntityType } from '../access-decision/access-decision.types';
import { RoleScope } from '../../enums/role-scope.enum';

function build() {
  const repo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    createQueryBuilder: jest.fn(),
  });
  const entity = repo();
  entity.findOne.mockResolvedValue({
    id: 'resource',
    availableForUse: true,
    availableForReporting: true,
    availableForMaintenance: true,
  });
  const contexts = repo();
  const query = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(1),
  };
  contexts.createQueryBuilder.mockReturnValue(query);
  const scope = repo();
  const bindings = repo();
  const owner = repo();
  const defaults = {
    getDefaultSettings: jest.fn().mockResolvedValue({
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['default-context'],
    }),
    applyDefaultScopeToMember: jest.fn(),
  };
  const contextAccess = new ContextAccessService(
    contexts as never,
    contexts as never,
    contexts as never,
    scope as never,
    bindings as never,
    {} as never,
    defaults as never,
    {} as never,
    contexts as never
  );
  const access = new AccessDecisionService(
    entity as never,
    entity as never,
    entity as never,
    owner as never,
    owner as never,
    owner as never,
    owner as never,
    owner as never,
    entity as never,
    contextAccess,
    entity as never,
    owner as never
  );
  return { access, contextAccess, defaults, contexts, scope, bindings, owner, query };
}

describe('Stored Context access uses the existing matrix without provisioning writes', () => {
  it('checks connector consumer batches without acquiring a lazy Context write lock', async () => {
    const s = build();
    await expect(
      s.access.canAccessMany(
        'user',
        ['editor'],
        EntityType.DATA_MART,
        ['first', 'second'],
        Action.EDIT,
        'project',
        { scopeMode: 'read-only' }
      )
    ).resolves.toEqual(
      new Map([
        ['first', true],
        ['second', true],
      ])
    );
    expect(s.defaults.applyDefaultScopeToMember).not.toHaveBeenCalled();
    expect(s.query.andWhere).toHaveBeenCalledWith('ec.context_id IN (:...memberContextIds)', {
      memberContextIds: ['default-context'],
    });
  });

  it.each([
    EntityType.DATA_MART,
    EntityType.STORAGE,
    EntityType.DESTINATION,
    EntityType.CREDENTIAL,
  ])('evaluates unmaterialized selected defaults for %s without any write', async type => {
    const s = build();
    await expect(
      s.access.canAccessStored('user', ['editor'], type, 'resource', Action.SEE, 'project')
    ).resolves.toBe(true);
    expect(s.query.andWhere).toHaveBeenCalledWith('ec.context_id IN (:...memberContextIds)', {
      memberContextIds: ['default-context'],
    });
    expect(s.defaults.applyDefaultScopeToMember).not.toHaveBeenCalled();
    for (const repository of [s.contexts, s.scope, s.bindings]) {
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
      expect(repository.upsert).not.toHaveBeenCalled();
    }
  });

  it('does not broaden selected scope after last binding is removed', async () => {
    const s = build();
    s.scope.findOne.mockResolvedValue({ roleScope: RoleScope.SELECTED_CONTEXTS });
    await expect(
      s.access.canAccessStored(
        'user',
        ['editor'],
        EntityType.DATA_MART,
        'resource',
        Action.SEE,
        'project'
      )
    ).resolves.toBe(false);
    expect(s.defaults.getDefaultSettings).not.toHaveBeenCalled();
    expect(s.contexts.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('honors an explicit entire-project scope without overlap or defaults', async () => {
    const s = build();
    s.scope.findOne.mockResolvedValue({ roleScope: RoleScope.ENTIRE_PROJECT });
    await expect(
      s.access.canAccessStored(
        'user',
        ['editor'],
        EntityType.STORAGE,
        'resource',
        Action.SEE,
        'project'
      )
    ).resolves.toBe(true);
    expect(s.defaults.getDefaultSettings).not.toHaveBeenCalled();
    expect(s.contexts.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps the ownership floor and admin shortcut', async () => {
    const s = build();
    s.owner.count.mockResolvedValue(1);
    await expect(
      s.access.canAccessStored(
        'user',
        ['editor'],
        EntityType.DATA_MART,
        'resource',
        Action.CONFIGURE_SHARING,
        'project'
      )
    ).resolves.toBe(true);
    await expect(
      s.access.canAccessStored(
        'user',
        ['admin'],
        EntityType.CREDENTIAL,
        'resource',
        Action.CONFIGURE_SHARING,
        'project'
      )
    ).resolves.toBe(true);
    expect(s.scope.findOne).not.toHaveBeenCalled();
    expect(s.defaults.getDefaultSettings).not.toHaveBeenCalled();
  });

  it('does not turn shared maintenance access into assignment authority', async () => {
    const s = build();
    await expect(
      s.access.canAccessStored(
        'user',
        ['editor'],
        EntityType.STORAGE,
        'resource',
        Action.CONFIGURE_SHARING,
        'project'
      )
    ).resolves.toBe(false);
  });

  it('propagates default read errors instead of granting project-wide scope', async () => {
    const s = build();
    s.defaults.getDefaultSettings.mockRejectedValue(new Error('database unavailable'));
    await expect(
      s.access.canAccessStored(
        'user',
        ['editor'],
        EntityType.STORAGE,
        'resource',
        Action.SEE,
        'project'
      )
    ).rejects.toThrow('database unavailable');
  });
});
