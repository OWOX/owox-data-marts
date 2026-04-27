import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role as IdpRole } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { UpdateProjectMemberCommand } from '../../dto/domain/update-project-member.command';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { ContextService } from '../../services/context/context.service';
import { isIdpNotFoundError } from '../../utils/is-idp-not-found-error';

export interface UpdateProjectMemberResult {
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
  roleScope: RoleScope;
  contextIds: string[];
}

@Injectable()
export class UpdateProjectMemberService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService,
    private readonly contextService: ContextService
  ) {}

  async run(command: UpdateProjectMemberCommand): Promise<UpdateProjectMemberResult> {
    const { projectId, actorUserId, targetUserId, role, roleScope, contextIds } = command;

    // Defence-in-depth: the OWOX Java IDP does not block self-modification at
    // its layer (legacy API is trusted to enforce it). Guard here so a single
    // regression upstream cannot lock the caller out of their own project.
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot modify your own membership');
    }

    const projectMembers = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const currentMember = projectMembers.find(m => m.userId === targetUserId);
    if (!currentMember) {
      throw new NotFoundException(`Member "${targetUserId}" not found in project "${projectId}"`);
    }

    // Validate context IDs before touching the IDP — otherwise a stale UI or
    // cross-project leak attempt would commit the role change in the IDP
    // first and only fail on the local write, leaving IDP/local out of sync.
    if (contextIds.length > 0) {
      await this.contextService.validateContextIds(contextIds, projectId);
    }

    // Change role in the IDP first — any failure here propagates and leaves
    // the local scope/contexts unchanged. A 404 from upstream means the
    // member was already removed concurrently (our cache is stale) — surface
    // it as a real 404 so the UI shows "refresh the list" rather than 500.
    if (role !== currentMember.role) {
      try {
        await this.idpProjectionsFacade.changeMemberRole(
          projectId,
          targetUserId,
          role as IdpRole,
          actorUserId
        );
      } catch (err) {
        if (isIdpNotFoundError(err)) {
          throw new NotFoundException(
            `Member "${targetUserId}" is no longer in project "${projectId}". Refresh the list and try again.`
          );
        }
        throw err;
      }
    }

    await this.contextAccessService.updateMember(targetUserId, projectId, {
      role,
      roleScope,
      contextIds,
    });

    const [resolvedRoleScope, resolvedContextIds] = await Promise.all([
      this.contextAccessService.getRoleScope(targetUserId, projectId),
      this.contextAccessService.getMemberContextIds(targetUserId, projectId),
    ]);

    return {
      userId: targetUserId,
      role,
      roleScope: resolvedRoleScope,
      contextIds: resolvedContextIds,
    };
  }
}
