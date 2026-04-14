jest.mock('@owox/idp-protocol', () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  IdpOperationNotSupportedError: class IdpOperationNotSupportedError extends Error {},
}));

import type { ProjectMemberInvitation } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from './idp-projections.facade';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { ProjectionsMapper } from '../mappers/projections.mapper';

describe('IdpProjectionsFacade — member mutation proxies', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const ACTOR_USER_ID = 'admin-42';

  let idpProjectionsService: jest.Mocked<
    Pick<IdpProjectionsService, 'inviteMember' | 'removeMember' | 'changeMemberRole'>
  >;
  let facade: IdpProjectionsFacade;

  beforeEach(() => {
    idpProjectionsService = {
      inviteMember: jest.fn(),
      removeMember: jest.fn(),
      changeMemberRole: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<IdpProjectionsService, 'inviteMember' | 'removeMember' | 'changeMemberRole'>
    >;

    facade = new IdpProjectionsFacade(
      idpProjectionsService as unknown as IdpProjectionsService,
      {} as ProjectionsMapper
    );
  });

  it('inviteMember — delegates to the service and returns its invitation result', async () => {
    const result: ProjectMemberInvitation = {
      projectId: PROJECT_ID,
      email: 'new@owox.io',
      role: 'editor',
      kind: 'email-sent',
      message: 'Invitation email sent',
    };
    idpProjectionsService.inviteMember.mockResolvedValue(result);

    const returned = await facade.inviteMember(PROJECT_ID, 'new@owox.io', 'editor', ACTOR_USER_ID);

    expect(idpProjectionsService.inviteMember).toHaveBeenCalledWith(
      PROJECT_ID,
      'new@owox.io',
      'editor',
      ACTOR_USER_ID
    );
    expect(returned).toBe(result);
  });

  it('inviteMember — propagates provider errors (no swallow)', async () => {
    idpProjectionsService.inviteMember.mockRejectedValue(new Error('IDP unavailable'));

    await expect(
      facade.inviteMember(PROJECT_ID, 'x@y.io', 'viewer', ACTOR_USER_ID)
    ).rejects.toThrow('IDP unavailable');
  });

  it('removeMember — delegates and returns void on success', async () => {
    idpProjectionsService.removeMember.mockResolvedValue(undefined);

    await expect(facade.removeMember(PROJECT_ID, USER_ID, ACTOR_USER_ID)).resolves.toBeUndefined();

    expect(idpProjectionsService.removeMember).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      ACTOR_USER_ID
    );
  });

  it('changeMemberRole — delegates with the new role', async () => {
    idpProjectionsService.changeMemberRole.mockResolvedValue(undefined);

    await facade.changeMemberRole(PROJECT_ID, USER_ID, 'admin', ACTOR_USER_ID);

    expect(idpProjectionsService.changeMemberRole).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      'admin',
      ACTOR_USER_ID
    );
  });
});
