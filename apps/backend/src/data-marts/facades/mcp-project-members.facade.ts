import type { ProjectRole } from '../enums/project-role.enum';
import type { RoleScope } from '../enums/role-scope.enum';

export { ProjectRole } from '../enums/project-role.enum';
export { RoleScope } from '../enums/role-scope.enum';

export const MCP_PROJECT_MEMBERS_FACADE = Symbol('MCP_PROJECT_MEMBERS_FACADE');

export interface McpProjectMember {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: ProjectRole;
  roleScope: RoleScope;
  contextIds: string[];
}

export interface McpProjectMembersFacade {
  listProjectMembers(projectId: string): Promise<McpProjectMember[]>;
}
