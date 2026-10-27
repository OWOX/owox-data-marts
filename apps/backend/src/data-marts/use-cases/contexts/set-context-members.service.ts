import { BadRequestException, Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ContextAccessService } from '../../services/context/context-access.service';
import type { SetContextMembersCommand } from '../../dto/domain/set-context-members.command';

export interface SetContextMembersResult {
  /** User ids actually persisted on the context (admins stripped). */
  assignedUserIds: string[];
  /**
   * Admin user ids the caller tried to attach. Admins always have project-wide
   * scope, so binding them to a context is a no-op — we surface the dropped
   * IDs so the UI can warn the admin instead of silently swallowing input.
   */
  droppedAdminIds: string[];
}

@Injectable()
export class SetContextMembersService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: SetContextMembersCommand): Promise<SetContextMembersResult> {
    const { contextId, projectId } = command;
    const assignedUserIds = [...new Set(command.assignedUserIds)];
    const projectMembers = (
      await this.idpProjectionsFacade.getProjectMembersOrThrow(projectId)
    ).filter(member => !member.isOutbound);
    const memberIds = new Set(projectMembers.map(m => m.userId));
    const adminIds = new Set(projectMembers.filter(m => m.role === 'admin').map(m => m.userId));

    const invalidIds = assignedUserIds.filter(id => !memberIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `User IDs are not members of this project: ${invalidIds.join(', ')}`
      );
    }

    const droppedAdminIds = assignedUserIds.filter(id => adminIds.has(id));
    const filteredUserIds = assignedUserIds.filter(id => !adminIds.has(id));

    await this.contextAccessService.setContextMembers(contextId, projectId, filteredUserIds);

    return { assignedUserIds: filteredUserIds, droppedAdminIds };
  }
}
