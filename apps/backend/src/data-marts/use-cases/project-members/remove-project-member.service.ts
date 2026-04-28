import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { isIdpNotFoundError } from '../../../idp/utils/is-idp-not-found-error';
import { RemoveProjectMemberCommand } from '../../dto/domain/remove-project-member.command';
import { ContextAccessService } from '../../services/context/context-access.service';

@Injectable()
export class RemoveProjectMemberService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: RemoveProjectMemberCommand): Promise<void> {
    const { projectId, actorUserId, targetUserId } = command;

    // Self-protection: same rationale as updateMember.
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot remove yourself from the project');
    }

    // Guard: only proceed if the member currently exists; otherwise surface a
    // 404 without touching local bindings.
    const member = await this.idpProjectionsFacade.getProjectMember(projectId, targetUserId);
    if (!member) {
      throw new NotFoundException(`Member "${targetUserId}" not found in project "${projectId}"`);
    }

    // Idempotent delete: if the IDP says the member is already gone
    // (concurrent removal, stale cache), treat it as success — the admin's
    // intent was "this user should not be in the project", which is satisfied.
    // We still run local cleanup below to drop orphan scope/context rows.
    try {
      await this.idpProjectionsFacade.removeMember(projectId, targetUserId, actorUserId);
    } catch (err) {
      if (!isIdpNotFoundError(err)) {
        throw err;
      }
    }

    await this.contextAccessService.removeMemberBindings(targetUserId, projectId);
  }
}
