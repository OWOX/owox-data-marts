import { NotFoundException } from '@nestjs/common';
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

  it('passes projectId, requestId and actor to facade', async () => {
    const { service, idpProjectionsFacade } = createService();

    await service.run(new DeclineMembershipRequestCommand('proj-1', 'admin-1', 'req-1'));

    expect(idpProjectionsFacade.declineMembershipRequest).toHaveBeenCalledWith(
      'proj-1',
      'req-1',
      'admin-1'
    );
  });

  it('propagates non-404 facade errors', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.declineMembershipRequest.mockRejectedValue(new Error('IDP down'));

    await expect(
      service.run(new DeclineMembershipRequestCommand('proj-1', 'admin-1', 'req-1'))
    ).rejects.toThrow('IDP down');
  });

  it('translates IDP 404 into NotFoundException (symmetric with approve)', async () => {
    const { service, idpProjectionsFacade } = createService();
    const notFound = Object.assign(new Error('Upstream resource not found'), {
      name: 'IdpNotFoundException',
      status: 404,
    });
    idpProjectionsFacade.declineMembershipRequest.mockRejectedValue(notFound);

    await expect(
      service.run(new DeclineMembershipRequestCommand('proj-1', 'admin-1', 'req-1'))
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
