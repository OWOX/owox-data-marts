export enum ProjectRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export const PROJECT_ROLE_VALUES: readonly ProjectRole[] = [
  ProjectRole.ADMIN,
  ProjectRole.EDITOR,
  ProjectRole.VIEWER,
];
