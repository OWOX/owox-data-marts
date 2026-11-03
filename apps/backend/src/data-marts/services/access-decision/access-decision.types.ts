import { RoleScope } from '../../enums/role-scope.enum';

export enum EntityType {
  STORAGE = 'STORAGE',
  DATA_MART = 'DATA_MART',
  DESTINATION = 'DESTINATION',
  CREDENTIAL = 'CREDENTIAL',
  DM_TRIGGER = 'DM_TRIGGER',
  REPORT = 'REPORT',
  REPORT_TRIGGER = 'REPORT_TRIGGER',
}

export enum Action {
  SEE = 'SEE',
  USE = 'USE',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  CONFIGURE_SHARING = 'CONFIGURE_SHARING',
  MANAGE_OWNERS = 'MANAGE_OWNERS',
  MANAGE_TRIGGERS = 'MANAGE_TRIGGERS',
  COPY_CREDENTIALS = 'COPY_CREDENTIALS',
  RUN = 'RUN',
}

export enum Role {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum OwnerStatus {
  ADMIN = 'ADMIN',
  TECH_OWNER = 'TECH_OWNER',
  BIZ_OWNER = 'BIZ_OWNER',
  OWNER = 'OWNER',
  NON_OWNER = 'NON_OWNER',
}

export enum SharingState {
  NOT_SHARED = 'NOT_SHARED',
  SHARED_FOR_REPORTING = 'SHARED_FOR_REPORTING',
  SHARED_FOR_USE = 'SHARED_FOR_USE',
  SHARED_FOR_MAINTENANCE = 'SHARED_FOR_MAINTENANCE',
  SHARED_FOR_BOTH = 'SHARED_FOR_BOTH',
}

export interface AccessRule {
  entityType: EntityType;
  action: Action;
  role: Role;
  ownershipStatus: OwnerStatus;
  sharingState: SharingState;
  result: boolean;
}

/**
 * Why a project member can or cannot take an action on a Data Mart: the step of the decision that
 * settles it, in the order `AccessDecisionService.canAccess` takes them.
 */
export enum DataMartAccessReason {
  PROJECT_ADMIN = 'PROJECT_ADMIN',
  OWNER = 'OWNER',
  PROJECT_WIDE_ACCESS = 'PROJECT_WIDE_ACCESS',
  SHARED_CONTEXT = 'SHARED_CONTEXT',
  /** A Sharing option would grant it to this role; the ones on do not. */
  NOT_SHARED = 'NOT_SHARED',
  /** No Sharing option grants it to this role, but owning the Data Mart would. */
  OWNER_REQUIRED = 'OWNER_REQUIRED',
  /** Neither Sharing nor owning the Data Mart grants it to this role. */
  ROLE_REQUIRED = 'ROLE_REQUIRED',
  DATA_MART_HAS_NO_CONTEXT = 'DATA_MART_HAS_NO_CONTEXT',
  NO_SHARED_CONTEXT = 'NO_SHARED_CONTEXT',
}

/** Everything an access decision on one Data Mart reads for one member, already loaded. */
export interface DataMartAccessFacts {
  /** The member's project roles, as `canAccess` receives them. */
  roles: string[];
  ownerStatus: OwnerStatus;
  availableForReporting: boolean;
  availableForMaintenance: boolean;
  roleScope: RoleScope;
  /** The member's contexts. Deleted ones drop out on intersection with the Data Mart's. */
  memberContextIds: readonly string[];
  /** The Data Mart's contexts, without deleted ones. */
  dataMartContextIds: readonly string[];
}

export interface DataMartAccessExplanation {
  granted: boolean;
  reason: DataMartAccessReason;
}
