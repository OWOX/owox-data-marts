import { ListMembershipRequestsService } from './list-membership-requests.service';

describe('ListMembershipRequestsService', () => {
  const createService = () => {
    const idpProjectionsFacade = {
      listMembershipRequests: jest.fn(),
    };
    const service = new ListMembershipRequestsService(idpProjectionsFacade as never);
    return { service, idpProjectionsFacade };
  };

  it('returns the array produced by the facade', async () => {
    const { service, idpProjectionsFacade } = createService();
    const stub = [
      {
        requestId: 'r1',
        email: 'a@b.io',
        requestedRole: 'viewer',
        createdAt: '2026-05-01T10:00:00Z',
      },
    ];
    idpProjectionsFacade.listMembershipRequests.mockResolvedValue(stub);

    const result = await service.run('project-1', 'actor-1');

    expect(idpProjectionsFacade.listMembershipRequests).toHaveBeenCalledWith(
      'project-1',
      'actor-1'
    );
    expect(result).toEqual(stub);
  });

  it('propagates facade errors', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.listMembershipRequests.mockRejectedValue(new Error('IDP refused'));
    await expect(service.run('project-1', 'actor-1')).rejects.toThrow('IDP refused');
  });
});
