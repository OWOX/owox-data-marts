import { Injectable, Logger } from '@nestjs/common';
import type { Role as IdpRole } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ApproveMembershipRequestCommand } from '../../dto/domain/approve-membership-request.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { ContextService } from '../../services/context/context.service';

export interface ApproveMembershipRequestUseCaseResult {
  userId: string;
  role: ProjectRole;
  roleScope: RoleScope;
  contextIds: string[];
}

@Injectable()
export class ApproveMembershipRequestService {
  private readonly logger = new Logger(ApproveMembershipRequestService.name);

  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService,
    private readonly contextService: ContextService
  ) {}

  async run(
    command: ApproveMembershipRequestCommand
  ): Promise<ApproveMembershipRequestUseCaseResult> {
    const { projectId, actorUserId, requestId, role, roleScope, contextIds } = command;

    // Per Fibery spec (`01d:102`): selected_contexts + zero contexts is a
    // valid state — the member simply gets no shared non-owner access through
    // Context matching. We do NOT block the approve. Default scope inference
    // for non-admin without explicit roleScope: presence of contextIds opts
    // into selected_contexts; otherwise entire_project (least surprising for
    // the legacy approve shape).
    const inferredScope =
      contextIds.length > 0 ? RoleScope.SELECTED_CONTEXTS : RoleScope.ENTIRE_PROJECT;
    const effectiveScope: RoleScope =
      role === ProjectRole.ADMIN ? RoleScope.ENTIRE_PROJECT : (roleScope ?? inferredScope);

    if (contextIds.length > 0) {
      await this.contextService.validateContextIds(contextIds, projectId);
    }

    const result = await this.idpProjectionsFacade.approveMembershipRequest(
      projectId,
      requestId,
      role as IdpRole,
      actorUserId
    );

    try {
      await this.contextAccessService.updateMember(result.userId, projectId, {
        role,
        roleScope: effectiveScope,
        contextIds,
      });
    } catch (err) {
      this.logger.error(
        `Approve accepted by IDP for request ${requestId} in project ${projectId}, but local scope/contexts write failed; admin must retry via updateMember.`,
        err instanceof Error ? err.stack : String(err)
      );
      throw err;
    }

    return {
      userId: result.userId,
      role,
      roleScope: effectiveScope,
      contextIds,
    };
  }
}
