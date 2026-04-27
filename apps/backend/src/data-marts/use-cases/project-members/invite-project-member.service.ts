import { Injectable, Logger } from '@nestjs/common';
import type { ProjectMemberInvitation, Role as IdpRole } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { InviteProjectMemberCommand } from '../../dto/domain/invite-project-member.command';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { ContextService } from '../../services/context/context.service';

@Injectable()
export class InviteProjectMemberService {
  private readonly logger = new Logger(InviteProjectMemberService.name);

  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService,
    private readonly contextService: ContextService
  ) {}

  async run(command: InviteProjectMemberCommand): Promise<ProjectMemberInvitation> {
    const { projectId, actorUserId, email, role, roleScope, contextIds } = command;

    // Per Fibery spec (`01d:102`): selected_contexts + zero contexts is a
    // valid state — the member simply gets no shared non-owner access through
    // Context matching. We do NOT block the invite. Default scope inference
    // for non-admin without explicit roleScope: presence of contextIds opts
    // into selected_contexts; otherwise entire_project (least surprising for
    // the legacy invite shape).
    const inferredScope =
      contextIds.length > 0 ? RoleScope.SELECTED_CONTEXTS : RoleScope.ENTIRE_PROJECT;
    const effectiveScope: RoleScope =
      role === 'admin' ? RoleScope.ENTIRE_PROJECT : (roleScope ?? inferredScope);

    if (contextIds.length > 0) {
      await this.contextService.validateContextIds(contextIds, projectId);
    }

    const invitation = await this.idpProjectionsFacade.inviteMember(
      projectId,
      email,
      role as IdpRole,
      actorUserId
    );

    // When the IDP pre-provisions the user (e.g. idp-better-auth returns a
    // real userId alongside the magic link), apply the requested scope and
    // contexts immediately. For IDPs that cannot surface userId until the
    // invitee accepts the invitation (e.g. idp-owox-better-auth email flow),
    // context bindings are deferred until first sign-in.
    if (invitation.userId) {
      // If the local write fails after the IDP accepted the invite we do NOT
      // swallow the error: the admin must retry via updateMember, and we log
      // for operability. A silent fallback here previously promoted the
      // invitee to entire_project scope.
      try {
        await this.contextAccessService.updateMember(invitation.userId, projectId, {
          role,
          roleScope: effectiveScope,
          contextIds,
        });
      } catch (err) {
        this.logger.error(
          `Invite accepted by IDP for ${email} in project ${projectId}, but local scope/contexts write failed; admin must retry via updateMember.`,
          err instanceof Error ? err.stack : String(err)
        );
        throw err;
      }
    }

    return invitation;
  }
}
