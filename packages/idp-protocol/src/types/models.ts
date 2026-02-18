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
};
