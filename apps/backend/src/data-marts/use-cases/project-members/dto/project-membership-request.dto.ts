import { ProjectRole } from '../../../enums/project-role.enum';

/**
 * Domain-layer projection of `ProjectMembershipRequest` from the IDP protocol.
 *
 * The list use-case maps the IDP shape into this DTO so neither the controller
 * nor the mapper has to cast `requestedRole as ProjectRole` — the boundary
 * lives in one place (the use-case) and downstream callers get a sound
 * `ProjectRole` typing.
 */
export interface ProjectMembershipRequestDto {
  requestId: string;
  email: string;
  fullName?: string;
  avatar?: string;
  userId?: string;
  requestedRole: ProjectRole;
  createdAt: string;
}
