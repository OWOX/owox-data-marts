import z from 'zod';

/**
 * The roles that are supported by the IDP.
 */
export const RoleEnum = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleEnum>;

/**
 * User provisioning modes supported by OWOX-managed IDP.
 */
export const UserProvisioningModeEnum = z.enum(['automatic', 'manual']);
export type UserProvisioningMode = z.infer<typeof UserProvisioningModeEnum>;

/**
 * Project lifecycle statuses exposed by the IDP project list.
 */
export const ProjectStatusEnum = z.enum(['active', 'blocked', 'removed']);
export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

/**
 * Standardized token payload that all IDP implementations must return when introspecting their native tokens.
 */
export const PayloadSchema = z
  .object({
    userId: z.string(),
    projectId: z.string(),
    email: z.string().optional(),
    fullName: z.string().optional(),
    avatar: z.string().url().optional(),
    roles: z.array(RoleEnum).optional(),
    projectTitle: z.string().optional(),
    signinProvider: z.string().optional(),
    authFlow: z.string().optional(),
    apiKeyId: z.string().optional(),
    /**
     * When true, the session is in view-only mode.
     * Providers should normalize provider-specific claims into this field.
     */
    viewOnly: z.boolean().optional(),
  })
  .passthrough();

export type Payload = z.infer<typeof PayloadSchema>;

export const ProjectSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: ProjectStatusEnum.optional(),
    roles: z.array(RoleEnum).optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

export const ProjectsSchema = z.array(ProjectSchema);

export type Project = z.infer<typeof ProjectSchema>;
export type Projects = z.infer<typeof ProjectsSchema>;

/**
 * Authentication result from IDP callback
 */
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
}

/**
 * Project member information
 */
export type ProjectMember = {
  userId: string;
  email: string;
  fullName?: string;
  avatar?: string;
  projectRole: string; // 'admin' | 'editor' | 'viewer'
  userStatus: string; // 'active' | 'blocked' | 'deleted' | 'locked' | 'erased'
  hasNotificationsEnabled: boolean; // from subscriptions.serviceNotifications
  isOutbound?: boolean; // user is not in the project anymore
};

/**
 * Result of a member invitation. Discriminated by `kind` because different IDP
 * providers have different semantics:
 *   - `email-sent` — the provider itself delivered the invitation email
 *     (e.g. `idp-owox-better-auth` via the remote OWOX Identity API).
 *   - `magic-link` — the provider produced a link that the admin must copy
 *     and deliver manually (e.g. `idp-better-auth` for self-hosted setups
 *     without an SMTP path).
 */
export type ProjectMemberInvitation =
  | {
      projectId: string;
      email: string;
      role: Role;
      kind: 'email-sent';
      userId?: string;
      message?: string;
    }
  | {
      projectId: string;
      email: string;
      role: Role;
      kind: 'magic-link';
      magicLink: string;
      userId?: string;
      expiresAt?: string;
      message?: string;
    };

/**
 * User provisioning settings exposed through the IDP protocol.
 * Context-scoped defaults are ODM-local and are intentionally not part of this contract.
 */
export type UserProvisioningSettings = {
  isApplicable: boolean;
  organization: {
    name: string;
    mainProjectName?: string | null;
    mainProjectTitle?: string | null;
  } | null;
  settings: {
    mode: UserProvisioningMode;
    defaultRole: Role;
  } | null;
};

/**
 * Update payload for user provisioning settings.
 */
export type UserProvisioningSettingsUpdate = {
  mode: UserProvisioningMode;
  defaultRole: Role;
};

/**
 * A pending request by some user to join a project. Surfaced by the IDP
 * provider to the BI backend so an admin can approve or decline it.
 *
 * `requestId` is a stable identifier from the IDP (NOT a short-lived JWT).
 * `userId` is present when the requester already exists in the IDP. The
 * legacy mock flow does not always know it.
 */
export type ProjectMembershipRequest = {
  requestId: string;
  email: string;
  fullName?: string;
  avatar?: string;
  userId?: string;
  requestedRole: Role;
  createdAt: string; // ISO 8601
};

/**
 * Result of approving a membership request. Java returns `{ userUid: string }`;
 * the BI side maps it to `userId` so the caller can chain
 * `ContextAccessService.updateMember`. Email and role are not echoed — both
 * are already known to the caller (email from the original request, role from
 * the approve command).
 */
export type ApproveMembershipRequestResult = {
  userId: string;
};

/**
 * Request-access context for a user authenticated in a project context without roles.
 */
export type UserProvisioningRequestAccessContext = {
  decision: 'request_access';
  user: {
    userId: string;
    email: string;
  };
  organization?: {
    name: string;
  } | null;
  project: {
    projectId: string;
    projectTitle: string;
  };
  availableRoles: Role[];
  defaultRole: Role;
  existingRequest?: {
    role: Role;
    status: string;
  } | null;
};

/**
 * Result of creating or finding a pending request to join the project.
 */
export type RequestProjectAccessResult = {
  userId: string;
  projectId: string;
  projectTitle: string;
  request: {
    role: Role;
    status: string;
  };
};

/**
 * Result of creating a new project from request-access flow.
 */
export type CreateNewProjectResult = {
  projectId: string;
  projectTitle: string;
};
