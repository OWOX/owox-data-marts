import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { CreateNewProjectService } from './create-new-project.service';
import { GetRequestAccessContextService } from './get-request-access-context.service';
import { RequestProjectAccessService } from './request-project-access.service';

describe('User provisioning request access use cases', () => {
  let idpProjectionsFacade: jest.Mocked<
    Pick<
      IdpProjectionsFacade,
      'getUserProvisioningRequestAccessContext' | 'requestProjectAccess' | 'createNewProject'
    >
  >;

  beforeEach(() => {
    idpProjectionsFacade = {
      getUserProvisioningRequestAccessContext: jest.fn(),
      requestProjectAccess: jest.fn(),
      createNewProject: jest.fn(),
    };
  });

  it('returns request access context for target project', async () => {
    const requestAccessContext = {
      decision: 'request_access' as const,
      user: { userId: 'user-1', email: 'user@example.com' },
      organization: { name: 'example.com' },
      project: { projectId: 'main-project', projectTitle: 'Main Project' },
      availableRoles: ['viewer' as const, 'editor' as const],
      defaultRole: 'viewer' as const,
      existingRequest: null,
    };
    idpProjectionsFacade.getUserProvisioningRequestAccessContext.mockResolvedValue(
      requestAccessContext
    );

    const service = new GetRequestAccessContextService(
      idpProjectionsFacade as unknown as IdpProjectionsFacade
    );

    await expect(service.run('user-1', 'main-project')).resolves.toBe(requestAccessContext);
    expect(idpProjectionsFacade.getUserProvisioningRequestAccessContext).toHaveBeenCalledWith(
      'user-1',
      'main-project'
    );
  });

  it('delegates request access to IDP facade', async () => {
    const result = {
      userId: 'user-1',
      projectId: 'main-project',
      projectTitle: 'Main Project',
      request: { role: 'viewer' as const, status: 'processing' },
    };
    idpProjectionsFacade.requestProjectAccess.mockResolvedValue(result);

    const service = new RequestProjectAccessService(
      idpProjectionsFacade as unknown as IdpProjectionsFacade
    );

    await expect(service.run('user-1', 'main-project', 'viewer')).resolves.toBe(result);
    expect(idpProjectionsFacade.requestProjectAccess).toHaveBeenCalledWith(
      'user-1',
      'main-project',
      'viewer'
    );
  });

  it('creates a separate project through OWOX Data Marts integration', async () => {
    const result = { projectId: 'created-project', projectTitle: 'Created Project' };
    idpProjectionsFacade.createNewProject.mockResolvedValue(result);

    const service = new CreateNewProjectService(
      idpProjectionsFacade as unknown as IdpProjectionsFacade
    );

    await expect(service.run('user-1')).resolves.toBe(result);
    expect(idpProjectionsFacade.createNewProject).toHaveBeenCalledWith('user-1', 'owox-data-marts');
  });
});
