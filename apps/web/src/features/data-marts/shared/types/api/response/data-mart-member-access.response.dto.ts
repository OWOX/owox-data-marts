/** The rule that decides one level of a member's access to a Data Mart. */
export type DataMartAccessReason =
  | 'PROJECT_ADMIN'
  | 'OWNER'
  | 'PROJECT_WIDE_ACCESS'
  | 'SHARED_CONTEXT'
  /** A Sharing option would grant it to this role; the ones on do not. */
  | 'NOT_SHARED'
  /** No Sharing option grants it to this role, but owning the Data Mart would. */
  | 'OWNER_REQUIRED'
  /** Neither Sharing nor owning the Data Mart grants it to this role. */
  | 'ROLE_REQUIRED'
  | 'DATA_MART_HAS_NO_CONTEXT'
  | 'NO_SHARED_CONTEXT';

export interface DataMartAccessLevelDto {
  granted: boolean;
  reason: DataMartAccessReason;
}

export interface DataMartMemberAccessItemDto {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  roleScope: 'entire_project' | 'selected_contexts';
  /** The member's contexts. They limit access only when `roleScope` is `selected_contexts`. */
  contexts: { id: string; name: string }[];
  /** See it in the catalog and through MCP, build reports on it. */
  use: DataMartAccessLevelDto;
  /** Edit and delete it, manage its triggers. */
  maintain: DataMartAccessLevelDto;
  /** Change its sharing and owners. */
  manageAccess: DataMartAccessLevelDto;
}

/** What every project member can do with a Data Mart, level by level, and why. */
export interface DataMartMemberAccessResponseDto {
  members: DataMartMemberAccessItemDto[];
}
