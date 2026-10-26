import type { DataMartAccessReason } from '../../services/access-decision';
import type { RoleScope } from '../../enums/role-scope.enum';

export class MemberContextDto {
  constructor(
    public readonly id: string,
    public readonly name: string
  ) {}
}

/** Whether a member has one level of access to a Data Mart, and the rule that decides it. */
export class DataMartAccessLevelDto {
  constructor(
    public readonly granted: boolean,
    public readonly reason: DataMartAccessReason
  ) {}
}

/** What one project member can do with a Data Mart, level by level, and why. */
export class DataMartMemberAccessDto {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly displayName: string | undefined,
    public readonly avatarUrl: string | undefined,
    public readonly role: string,
    public readonly roleScope: RoleScope,
    /** The member's contexts, without deleted ones. Only gate access for selected-contexts scope. */
    public readonly contexts: MemberContextDto[],
    /** See it in the catalog and through MCP, build reports on it. */
    public readonly use: DataMartAccessLevelDto,
    /** Edit and delete it, manage its triggers. */
    public readonly maintain: DataMartAccessLevelDto,
    /** Change its sharing and owners. */
    public readonly manageAccess: DataMartAccessLevelDto
  ) {}
}
