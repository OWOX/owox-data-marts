import type { AuthorizationContext } from '../../idp';
import { Action, EntityType } from '../services/access-decision';
import { CredentialSourceConsumersService } from './credential-source-consumers.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const orders = { id: 'dm-orders', title: 'Orders' };
const payroll = { id: 'dm-payroll', title: 'Payroll' };

function setup(visible: readonly string[]) {
  const dataMarts = { find: jest.fn().mockResolvedValue([orders, payroll]) };
  const access = {
    canAccessMany: jest.fn(
      async (_user: string, _roles: string[], _type: EntityType, ids: readonly string[]) =>
        new Map(ids.map(id => [id, visible.includes(id)]))
    ),
  };
  const consumerTitles = { register: jest.fn() };
  const service = new CredentialSourceConsumersService(
    dataMarts as never,
    access as never,
    consumerTitles as never
  );
  service.onModuleInit();
  const [[consumerType, lookup]] = consumerTitles.register.mock.calls;
  return { dataMarts, access, consumerType, lookup };
}

describe('CredentialSourceConsumersService', () => {
  it('Used by shows the Data Mart title to a member who can see it and hides it otherwise', async () => {
    const state = setup([orders.id]);

    expect(state.consumerType).toBe('connector-config');
    await expect(state.lookup(context, [orders.id, payroll.id])).resolves.toEqual(
      new Map([[orders.id, 'Orders']])
    );
    expect(state.access.canAccessMany).toHaveBeenCalledWith(
      'member-1',
      ['editor'],
      EntityType.DATA_MART,
      [orders.id, payroll.id],
      Action.SEE,
      'project-1'
    );
    expect(state.dataMarts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: 'project-1' }) })
    );
  });

  it('makes no query without Data Mart consumers', async () => {
    const state = setup([]);

    await expect(state.lookup(context, [])).resolves.toEqual(new Map());
    expect(state.dataMarts.find).not.toHaveBeenCalled();
    expect(state.access.canAccessMany).not.toHaveBeenCalled();
  });
});
