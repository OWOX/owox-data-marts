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
    email: z.string().email().optional(),
    fullName: z.string().optional(),
    avatar: z.string().url().optional(),
    roles: z.array(RoleEnum).nonempty().optional(),
    projectTitle: z.string().optional(),
  })
  .passthrough();

export type Payload = z.infer<typeof PayloadSchema>;

/**
 * Authentication result from IDP callback
 */
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
}
