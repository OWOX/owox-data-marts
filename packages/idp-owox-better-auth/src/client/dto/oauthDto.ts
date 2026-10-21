import { z } from 'zod';
import {
  McpOAuthProjectMemberContextSchema,
  McpScopeEnum,
  McpTokenPayloadSchema,
  OAuthAuthorizationCodeSchema,
  OAuthAuthorizationRequestSchema,
  OAuthTokenExchangeRequestSchema,
  OAuthTokenExchangeResultSchema,
  RoleEnum,
} from '@owox/idp-protocol';

export const McpOAuthAuthorizationCodeRequestSchema = z.object({
  request: OAuthAuthorizationRequestSchema,
  projectMember: McpOAuthProjectMemberContextSchema,
});
export type McpOAuthAuthorizationCodeRequest = z.infer<
  typeof McpOAuthAuthorizationCodeRequestSchema
>;

export const McpOAuthAuthorizationCodeResponseSchema = OAuthAuthorizationCodeSchema;
export type McpOAuthAuthorizationCodeResponse = z.infer<
  typeof McpOAuthAuthorizationCodeResponseSchema
>;

export const McpOAuthTokenExchangeRequestSchema = OAuthTokenExchangeRequestSchema;
export type McpOAuthTokenExchangeRequest = z.infer<typeof McpOAuthTokenExchangeRequestSchema>;

export const McpOAuthTokenExchangeResponseSchema = OAuthTokenExchangeResultSchema;
export type McpOAuthTokenExchangeResponse = z.infer<typeof McpOAuthTokenExchangeResponseSchema>;

/**
 * Error body returned by the IB `IpdApiExceptionHandler` when MCP grant validation throws
 * `AuthenticationException` or `InvalidTokenException`. The IB internal authorization
 * interceptor emits an empty 401 instead, keeping C2C failures separate from invalid grants.
 * Keep this list aligned with those producer-side exception reasons and fail closed when an
 * unknown 401 body appears.
 */
export const McpOAuthGrantErrorResponseSchema = z.object({
  message: z.enum(['Authentication Error', 'Authentication Error, Invalid token']),
});

export const McpOAuthTokenVerificationRequestSchema = z.object({
  token: z.string().min(1),
  resource: z.string().url(),
  requiredScopes: z.array(McpScopeEnum),
});
export type McpOAuthTokenVerificationRequest = z.infer<
  typeof McpOAuthTokenVerificationRequestSchema
>;

export const McpOAuthTokenVerificationResponseSchema = z.discriminatedUnion('active', [
  z.object({
    active: z.literal(true),
    // IB can refresh a token after membership removal and return an empty current role list.
    // Parse that denial here; only non-empty roles may leave the client as a verified payload.
    payload: McpTokenPayloadSchema.extend({ roles: z.array(RoleEnum) }),
  }),
  z.object({
    active: z.literal(false),
  }),
]);
export type McpOAuthTokenVerificationResponse = z.infer<
  typeof McpOAuthTokenVerificationResponseSchema
>;
