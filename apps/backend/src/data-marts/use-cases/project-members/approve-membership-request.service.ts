import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ApproveMembershipRequestResult } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { isIdpNotFoundError } from '../../../idp/utils/is-idp-not-found-error';
import { ApproveMembershipRequestCommand } from '../../dto/domain/approve-membership-request.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { toIdpRole } from '../../mappers/project-members.mapper';
import { ContextAccessService } from '../../services/context/context-access.service';
import { ContextService } from '../../services/context/context.service';
import {
  applyLocalMemberScope,
  readPersistedMemberScope,
  resolveEffectiveScope,
  validateContextIdsIfAny,
} from './util/member-scope-saga.util';

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

    const effectiveScope = resolveEffectiveScope(role, roleScope, contextIds);

    await validateContextIdsIfAny(this.contextService, contextIds, projectId);

    let result: ApproveMembershipRequestResult;
    try {
      result = await this.idpProjectionsFacade.approveMembershipRequest(
        projectId,
        requestId,
        toIdpRole(role),
        actorUserId
      );
    } catch (err) {
      if (isIdpNotFoundError(err)) {
        throw new NotFoundException(`Membership request "${requestId}" not found`);
      }
      throw err;
    }

    await applyLocalMemberScope({
      contextAccessService: this.contextAccessService,
      logger: this.logger,
      userId: result.userId,
      projectId,
      role,
      effectiveScope,
      contextIds,
      failureLabel: `Approve accepted by IDP for request ${requestId} in project ${projectId}`,
    });

    const persisted = await readPersistedMemberScope(
      this.contextAccessService,
      result.userId,
      projectId
    );

    return {
      userId: result.userId,
      role,
      roleScope: persisted.roleScope,
      contextIds: persisted.contextIds,
    };
  }
}
