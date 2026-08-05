import { PluginEntityAuthorizationFacadeImpl } from './plugin-entity-authorization.facade.impl';

describe('PluginEntityAuthorizationFacadeImpl', () => {
  const dataMarts = { exist: jest.fn() };
  const storages = { exist: jest.fn() };
  const destinations = { exist: jest.fn() };
  const reports = { findOne: jest.fn() };
  const accessDecision = { canAccess: jest.fn(), canAccessReport: jest.fn() };
  const service = new PluginEntityAuthorizationFacadeImpl(
    dataMarts as never,
    storages as never,
    destinations as never,
    reports as never,
    accessDecision as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('checks project ownership before the access matrix, including for admins', async () => {
    dataMarts.exist.mockResolvedValue(false);

    await expect(
      service.canAccess({
        projectId: 'project-a',
        userId: 'admin',
        roles: ['admin'],
        entityType: 'data-mart',
        entityId: 'mart-from-project-b',
        action: 'SEE',
      })
    ).resolves.toBe(false);
    expect(accessDecision.canAccess).not.toHaveBeenCalled();
  });

  it('passes a project-owned entity to the existing decision service', async () => {
    storages.exist.mockResolvedValue(true);
    accessDecision.canAccess.mockResolvedValue(true);

    await expect(
      service.canAccess({
        projectId: 'project-a',
        userId: 'user-1',
        roles: ['viewer'],
        entityType: 'storage',
        entityId: 'storage-1',
        action: 'SEE',
      })
    ).resolves.toBe(true);
    expect(accessDecision.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      'STORAGE',
      'storage-1',
      'SEE',
      'project-a'
    );
  });

  it('requires the report parent Data Mart to belong to the current project', async () => {
    reports.findOne.mockResolvedValue(null);

    await expect(
      service.canAccess({
        projectId: 'project-a',
        userId: 'admin',
        roles: ['admin'],
        entityType: 'report',
        entityId: 'report-from-project-b',
        action: 'SEE',
      })
    ).resolves.toBe(false);
    expect(reports.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report-from-project-b', dataMart: { projectId: 'project-a' } },
      })
    );
    expect(accessDecision.canAccessReport).not.toHaveBeenCalled();
  });

  it('does not fan list authorization into concurrent database work', async () => {
    let active = 0;
    let maximumActive = 0;
    const check = jest.spyOn(service, 'canAccess').mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setImmediate(resolve));
      active -= 1;
      return true;
    });
    const requests = ['one', 'two', 'three'].map(entityId => ({
      projectId: 'project-a',
      userId: 'user-1',
      roles: ['viewer'],
      entityType: 'data-mart' as const,
      entityId,
      action: 'SEE' as const,
    }));

    await expect(service.canAccessMany(requests)).resolves.toEqual(
      new Map(requests.map(request => [request.entityId, true]))
    );
    expect(check).toHaveBeenCalledTimes(3);
    expect(maximumActive).toBe(1);
  });
});
