import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ContextAccessService } from '../../services/context/context-access.service';

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

  async run(
    contextId: string,
    projectId: string,
    assignedUserIds: string[]
  ): Promise<SetContextMembersResult> {
    const projectMembers = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const adminIds = new Set(projectMembers.filter(m => m.role === 'admin').map(m => m.userId));

    const droppedAdminIds = assignedUserIds.filter(id => adminIds.has(id));
    const filteredUserIds = assignedUserIds.filter(id => !adminIds.has(id));

    await this.contextAccessService.setContextMembers(contextId, projectId, filteredUserIds);

    return { assignedUserIds: filteredUserIds, droppedAdminIds };
  }
}
