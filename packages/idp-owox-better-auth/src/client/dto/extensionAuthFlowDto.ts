import { ProjectsSchema } from '@owox/idp-protocol';
import { z } from 'zod';
import { TokenResponseSchema } from './tokenDto.js';

export const IdentitySessionTokenResponseSchema = z.object({
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  tokenType: z.string().min(1),
  accessTokenExpiresIn: z.number().positive(),
  refreshTokenExpiresIn: z.number().positive(),
  sessionId: z.string().min(1),
  sessionExpiresAt: z.string().datetime({ offset: true }),
});

export type IdentitySessionTokenResponse = z.infer<typeof IdentitySessionTokenResponseSchema>;

export const ExtensionSessionIssueResponseSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('project_token'),
    projectToken: TokenResponseSchema,
  }),
  z.object({
    mode: z.literal('identity_session'),
    identitySession: IdentitySessionTokenResponseSchema,
  }),
]);

export type ExtensionSessionIssueResponse = z.infer<typeof ExtensionSessionIssueResponseSchema>;

export const ExtensionSessionProjectsResponseSchema = ProjectsSchema;

export type ExtensionSessionProjectsResponse = z.infer<
  typeof ExtensionSessionProjectsResponseSchema
>;

export interface ExtensionSessionIssueRequest {
  userId: string;
  projectId?: string;
}

export interface IdentitySessionRefreshRequest {
  refreshToken: string;
}

export interface IdentitySessionAccessTokenRequest {
  accessToken: string;
}

export interface IdentitySessionProjectTokenRequest {
  accessToken: string;
  projectId: string;
}

export interface IdentitySessionRevokeRequest {
  refreshToken: string;
}

export interface ExtensionProjectTokenRevokeRequest {
  refreshToken: string;
}
