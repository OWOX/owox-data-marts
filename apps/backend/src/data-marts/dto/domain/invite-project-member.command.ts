import { RoleScope } from '../../enums/role-scope.enum';

export class InviteProjectMemberCommand {
  constructor(
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly email: string,
    public readonly role: 'admin' | 'editor' | 'viewer',
    public readonly roleScope: RoleScope | undefined,
    public readonly contextIds: string[]
  ) {}
}
