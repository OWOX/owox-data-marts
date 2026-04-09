jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { MemberOwnershipWarningsService } from './member-ownership-warnings.service';

describe('MemberOwnershipWarningsService', () => {
  const createService = () => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const technicalOwnerRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
    };

    const service = new MemberOwnershipWarningsService(
      technicalOwnerRepository as never,
      idpProjectionsFacade as never
    );

    return { service, qb, idpProjectionsFacade };
  };

  it('should return empty when no viewers', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', role: 'editor', isOutbound: false },
    ]);

    const warnings = await service.getWarnings('proj-1');
    expect(warnings).toEqual([]);
  });

  it('should return warning when viewer is tech owner', async () => {
    const { service, idpProjectionsFacade, qb } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', role: 'viewer', isOutbound: false },
      { userId: 'user-2', role: 'editor', isOutbound: false },
    ]);
    qb.getRawMany.mockResolvedValue([{ userId: 'user-1' }]);

    const warnings = await service.getWarnings('proj-1');
    expect(warnings).toEqual([
      {
        userId: 'user-1',
        warning: 'Technical Owner — requires Technical User role to be effective',
      },
    ]);
  });

  it('should skip outbound viewers', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'user-1', role: 'viewer', isOutbound: true },
    ]);

    const warnings = await service.getWarnings('proj-1');
    expect(warnings).toEqual([]);
  });
});
