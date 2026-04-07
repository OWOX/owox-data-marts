export enum EntityType {
  STORAGE = 'STORAGE',
  DATA_MART = 'DATA_MART',
  DESTINATION = 'DESTINATION',
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
