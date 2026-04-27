import { RoleScope } from '../../enums/role-scope.enum';

export class UpdateProjectMemberCommand {
  constructor(
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly targetUserId: string,
    public readonly role: 'admin' | 'editor' | 'viewer',
    public readonly roleScope: RoleScope,
    public readonly contextIds: string[]
  ) {}
}
