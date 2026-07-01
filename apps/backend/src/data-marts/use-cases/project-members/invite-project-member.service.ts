import { Injectable, Logger } from '@nestjs/common';
import type { ProjectMemberInvitation } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { InviteProjectMemberCommand } from '../../dto/domain/invite-project-member.command';
import { toIdpRole } from '../../mappers/project-members.mapper';
import { ContextAccessService } from '../../services/context/context-access.service';
import { ContextService } from '../../services/context/context.service';
import {
  applyLocalMemberScope,
  resolveEffectiveScope,
  validateContextIdsIfAny,
} from './util/member-scope-saga.util';

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

    const effectiveScope = resolveEffectiveScope(role, roleScope, contextIds);

    await validateContextIdsIfAny(this.contextService, contextIds, projectId);

    const invitation = await this.idpProjectionsFacade.inviteMember(
      projectId,
      email,
      toIdpRole(role),
      actorUserId
    );

    if (invitation.userId) {
      await applyLocalMemberScope({
        contextAccessService: this.contextAccessService,
        logger: this.logger,
        userId: invitation.userId,
        projectId,
        role,
        effectiveScope,
        contextIds,
        failureLabel: `Invite accepted by IDP for ${email} in project ${projectId}`,
      });
    }

    return invitation;
  }
}
