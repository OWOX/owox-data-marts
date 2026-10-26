import type { DataMartAccessReason } from '../../services/access-decision';
import type { RoleScope } from '../../enums/role-scope.enum';

export class MemberContextDto {
  constructor(
    public readonly id: string,
    public readonly name: string
  ) {}
}

/** Whether a member may take a group of actions on a Data Mart, and the rule that decides it. */
export class DataMartAccessLevelDto {
  constructor(
    public readonly granted: boolean,
    public readonly reason: DataMartAccessReason
  ) {}
}

/** Where the member stands in the Data Mart's Ownership: its Data Owner, its Business Owner, or neither. */
export enum DataMartMemberOwnership {
  DATA_OWNER = 'DATA_OWNER',
  BUSINESS_OWNER = 'BUSINESS_OWNER',
}

/** What one project member can do with a Data Mart, action group by action group, and why. */
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
    public readonly ownership: DataMartMemberOwnership | null,
    /** See and Use: find it in the catalog and through MCP, build reports on it. */
    public readonly see: DataMartAccessLevelDto,
    /** Edit, Delete and Manage Triggers. */
    public readonly edit: DataMartAccessLevelDto,
    /** Configure Sharing and Manage Owners. */
    public readonly configureSharing: DataMartAccessLevelDto
  ) {}
}
