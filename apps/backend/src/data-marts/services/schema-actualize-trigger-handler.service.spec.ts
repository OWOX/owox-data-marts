jest.mock('../../idp/facades/idp-projections.facade', () => ({ IdpProjectionsFacade: jest.fn() }));
jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { SchemaActualizeTriggerHandlerService } from './schema-actualize-trigger-handler.service';
import { SchemaActualizeTrigger } from '../entities/schema-actualize-trigger.entity';
import { ActualizeDataMartSchemaService } from '../use-cases/actualize-data-mart-schema.service';
import { Action, EntityType } from './access-decision';

describe('Schema actualization queued authority', () => {
  function setup() {
    const trigger = Object.assign(new SchemaActualizeTrigger(), {
      id: 'trigger',
      userId: 'user',
      projectId: 'project',
      dataMartId: 'mart',
    });
    const idp = {
      getProjectForUser: jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] }),
    };
    const warehouse = { checkIsValid: jest.fn() };
    const marts = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'mart', storage: { id: 'storage' } }),
      actualizeSchemaInEntity: jest.fn(),
      saveActualizedSchema: jest.fn(),
      lockConfigurationReferences: jest.fn(),
    };
    const access = {
      canAccess: jest
        .fn()
        .mockImplementation(async (_user, roles, type, _id, action) =>
          type === EntityType.STORAGE ? true : roles.includes('editor') && action === Action.EDIT
        ),
    };
    const actualizer = new ActualizeDataMartSchemaService(
      marts as any,
      warehouse as any,
      { toDomainDto: () => ({ id: 'mart' }) } as any,
      access as any
    );
    const handler = new SchemaActualizeTriggerHandlerService(
      { save: jest.fn() } as any,
      {} as any,
      actualizer,
      idp as any
    );
    return { handler, trigger, idp, access, warehouse, marts };
  }

  it('uses the requesting actor and fresh roles for a queued refresh', async () => {
    const { handler, trigger, idp, access, warehouse } = setup();
    await handler.handleTrigger(trigger);
    expect(trigger.uiResponse).toEqual({ success: true });
    expect(idp.getProjectForUser).toHaveBeenCalledWith('user', 'project');
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.STORAGE,
      'storage',
      Action.USE,
      'project'
    );
    expect(warehouse.checkIsValid).toHaveBeenCalledTimes(1);
  });

  it('does no warehouse work after the queued actor loses their edit role', async () => {
    const { handler, trigger, idp, warehouse, marts } = setup();
    idp.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
    await handler.handleTrigger(trigger);
    expect(trigger.uiResponse.success).toBe(false);
    expect(warehouse.checkIsValid).not.toHaveBeenCalled();
    expect(marts.actualizeSchemaInEntity).not.toHaveBeenCalled();
  });

  it('does no warehouse work after Storage USE is revoked while queued', async () => {
    const { handler, trigger, access, warehouse, marts } = setup();
    access.canAccess.mockImplementation(async (_user, _roles, type) => type !== EntityType.STORAGE);
    await handler.handleTrigger(trigger);
    expect(trigger.uiResponse.success).toBe(false);
    expect(warehouse.checkIsValid).not.toHaveBeenCalled();
    expect(marts.actualizeSchemaInEntity).not.toHaveBeenCalled();
  });

  it.each(['missing actor', 'missing membership', 'wrong project'])(
    'rejects %s without warehouse work',
    async reason => {
      const { handler, trigger, idp, warehouse } = setup();
      if (reason === 'missing actor') trigger.userId = '';
      else if (reason === 'wrong project')
        idp.getProjectForUser.mockResolvedValue({ id: 'other', roles: ['admin'] });
      else idp.getProjectForUser.mockResolvedValue(undefined);
      await handler.handleTrigger(trigger);
      expect(trigger.uiResponse.success).toBe(false);
      expect(warehouse.checkIsValid).not.toHaveBeenCalled();
    }
  );
});
