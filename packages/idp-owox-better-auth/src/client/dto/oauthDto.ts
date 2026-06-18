import { z } from 'zod';
import {
  McpOAuthProjectMemberContextSchema,
  McpScopeEnum,
  McpTokenPayloadSchema,
  OAuthAuthorizationCodeSchema,
  OAuthAuthorizationRequestSchema,
  OAuthTokenExchangeRequestSchema,
  OAuthTokenExchangeResultSchema,
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
    payload: McpTokenPayloadSchema,
  }),
  z.object({
    active: z.literal(false),
  }),
]);
export type McpOAuthTokenVerificationResponse = z.infer<
  typeof McpOAuthTokenVerificationResponseSchema
>;
