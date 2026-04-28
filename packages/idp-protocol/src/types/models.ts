import z from 'zod';

/**
 * The roles that are supported by the IDP.
 */
export const RoleEnum = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleEnum>;

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
    roles: z.array(RoleEnum).nonempty().optional(),
    projectTitle: z.string().optional(),
    signinProvider: z.string().optional(),
  })
  .passthrough();

export type Payload = z.infer<typeof PayloadSchema>;

const ProjectSchema = z
  .object({
    id: z.string(),
    title: z.string(),
  })
  .passthrough();

export const ProjectsSchema = z.array(ProjectSchema);

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
