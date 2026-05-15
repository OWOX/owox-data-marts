import { ProjectRole } from '../../enums/project-role.enum';
import { ListMembershipRequestsService } from './list-membership-requests.service';

describe('ListMembershipRequestsService', () => {
  const createService = () => {
    const idpProjectionsFacade = {
      listMembershipRequests: jest.fn(),
    };
    const service = new ListMembershipRequestsService(idpProjectionsFacade as never);
    return { service, idpProjectionsFacade };
  };

  it('maps IDP protocol shape to data-marts DTO (drops `as Role` casting boundary)', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.listMembershipRequests.mockResolvedValue([
      {
        requestId: 'r1',
        email: 'a@b.io',
        requestedRole: 'viewer',
        createdAt: '2026-05-01T10:00:00Z',
        fullName: 'Alice Example',
        avatar: 'https://example.com/a.png',
        userId: 'user-a',
      },
    ]);

    const result = await service.run('project-1', 'actor-1');

    expect(idpProjectionsFacade.listMembershipRequests).toHaveBeenCalledWith(
      'project-1',
      'actor-1'
    );
    expect(result).toEqual([
      {
        requestId: 'r1',
        email: 'a@b.io',
        requestedRole: ProjectRole.VIEWER,
        createdAt: '2026-05-01T10:00:00Z',
        fullName: 'Alice Example',
        avatar: 'https://example.com/a.png',
        userId: 'user-a',
      },
    ]);
  });

  it('returns an empty array when facade returns an empty list', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.listMembershipRequests.mockResolvedValue([]);

    const result = await service.run('project-1', 'actor-1');
    expect(result).toEqual([]);
  });

  it('propagates facade errors', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.listMembershipRequests.mockRejectedValue(new Error('IDP refused'));
    await expect(service.run('project-1', 'actor-1')).rejects.toThrow('IDP refused');
  });
});
