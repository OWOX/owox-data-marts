import { DeclineMembershipRequestCommand } from '../../dto/domain/decline-membership-request.command';
import { DeclineMembershipRequestService } from './decline-membership-request.service';

describe('DeclineMembershipRequestService', () => {
  const createService = () => {
    const idpProjectionsFacade = {
      declineMembershipRequest: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DeclineMembershipRequestService(idpProjectionsFacade as never);
    return { service, idpProjectionsFacade };
  };

  it('passes projectId, requestId, actor and reason to facade', async () => {
    const { service, idpProjectionsFacade } = createService();

    await service.run(new DeclineMembershipRequestCommand('proj-1', 'admin-1', 'req-1', 'spam'));

    expect(idpProjectionsFacade.declineMembershipRequest).toHaveBeenCalledWith(
      'proj-1',
      'req-1',
      'admin-1',
      'spam'
    );
  });

  it('propagates facade errors', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.declineMembershipRequest.mockRejectedValue(new Error('IDP down'));

    await expect(
      service.run(new DeclineMembershipRequestCommand('proj-1', 'admin-1', 'req-1'))
    ).rejects.toThrow('IDP down');
  });
});
