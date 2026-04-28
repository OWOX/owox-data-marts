import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';

export class UpdateProjectMemberCommand {
  constructor(
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly targetUserId: string,
    public readonly role: ProjectRole,
    public readonly roleScope: RoleScope,
    public readonly contextIds: string[]
  ) {}
}
