import z from 'zod';
import { RoleEnum } from './models.js';

export const McpScopeEnum = z.enum(['mcp:read', 'mcp:write']);
export type McpScope = z.infer<typeof McpScopeEnum>;

export const OAuthProtectedResourceMetadataSchema = z.object({
  resource: z.string().url(),
  authorization_servers: z.array(z.string().url()).min(1),
  scopes_supported: z.array(McpScopeEnum).optional(),
  resource_documentation: z.string().url().optional(),
});
export type OAuthProtectedResourceMetadata = z.infer<typeof OAuthProtectedResourceMetadataSchema>;

export const OAuthAuthorizationServerMetadataSchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  registration_endpoint: z.string().url().optional(),
  jwks_uri: z.string().url().optional(),
  response_types_supported: z.array(z.literal('code')).min(1),
  grant_types_supported: z.array(z.enum(['authorization_code', 'refresh_token'])).min(1),
  code_challenge_methods_supported: z.array(z.literal('S256')).min(1),
  scopes_supported: z.array(McpScopeEnum),
  token_endpoint_auth_methods_supported: z.array(z.literal('none')),
});
export type OAuthAuthorizationServerMetadata = z.infer<
  typeof OAuthAuthorizationServerMetadataSchema
>;

export const McpOAuthProjectMemberContextSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  email: z.string().email().optional(),
  fullName: z.string().optional(),
  // The identity service sends `null` when the user has no avatar (or has
  // restricted it); accept it and normalize to `undefined` so downstream
  // consumers keep a `string | undefined` shape.
  avatar: z
    .string()
    .url()
    .nullish()
    .transform(value => value ?? undefined),
  roles: z.array(RoleEnum).min(1),
});
export type McpOAuthProjectMemberContext = z.infer<typeof McpOAuthProjectMemberContextSchema>;

export const McpTokenPayloadSchema = McpOAuthProjectMemberContextSchema.extend({
  clientId: z.string().min(1),
  resource: z.string().url(),
  scopes: z.array(McpScopeEnum).min(1),
  authFlow: z.literal('mcp'),
});
export type McpTokenPayload = z.infer<typeof McpTokenPayloadSchema>;

export const OAuthAuthorizationRequestSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  resource: z.string().url(),
  scopes: z.array(McpScopeEnum).min(1),
  state: z.string().min(1),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
});
export type OAuthAuthorizationRequest = z.infer<typeof OAuthAuthorizationRequestSchema>;

export const OAuthAuthorizationCodeSchema = z.object({
  code: z.string().min(1),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  resource: z.string().url(),
  scopes: z.array(McpScopeEnum).min(1),
  expiresAt: z.string().datetime(),
});
export type OAuthAuthorizationCode = z.infer<typeof OAuthAuthorizationCodeSchema>;

export const OAuthTokenExchangeRequestSchema = z.object({
  grantType: z.enum(['authorization_code', 'refresh_token']),
  code: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  clientId: z.string().min(1),
  redirectUri: z.string().url().optional(),
  resource: z.string().url(),
  codeVerifier: z.string().min(1).optional(),
});
export type OAuthTokenExchangeRequest = z.infer<typeof OAuthTokenExchangeRequestSchema>;

export const OAuthTokenExchangeResultSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.enum(['Bearer', 'bearer']),
  expires_in: z.number().int().positive(),
  scope: z.string().min(1),
});
export type OAuthTokenExchangeResult = z.infer<typeof OAuthTokenExchangeResultSchema>;

export const OAuthJwksResultSchema = z.object({
  keys: z.array(z.record(z.unknown())),
});
export type OAuthJwksResult = z.infer<typeof OAuthJwksResultSchema>;
