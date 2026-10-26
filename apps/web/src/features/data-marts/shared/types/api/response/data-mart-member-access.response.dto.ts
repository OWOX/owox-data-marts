/** The rule that decides whether a member may take a group of actions on a Data Mart. */
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
  /** The member's place in the Data Mart's Ownership. */
  ownership: 'DATA_OWNER' | 'BUSINESS_OWNER' | null;
  /** See and Use: find it in the catalog and through MCP, build reports on it. */
  see: DataMartAccessLevelDto;
  /** Edit, Delete and Manage Triggers. */
  edit: DataMartAccessLevelDto;
  /** Configure Sharing and Manage Owners. */
  configureSharing: DataMartAccessLevelDto;
}

/** What every project member can do with a Data Mart, and why. */
export interface DataMartMemberAccessResponseDto {
  members: DataMartMemberAccessItemDto[];
}
