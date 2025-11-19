import { z } from 'zod';

export const OAuthAttributesEnum = z.enum(['UI', 'SECRET', 'REQUIRED']);
export type OAuthAttribute = z.infer<typeof OAuthAttributesEnum>;

export const OAuthVarStoreEnum = z.enum(['env', 'secret']);
export type OAuthVarStore = z.infer<typeof OAuthVarStoreEnum>;

export const OAuthVarSchema = z.object({
  type: z.string().optional(),
  required: z.boolean().optional(),
  store: OAuthVarStoreEnum.optional(),
  key: z.string(),
  default: z.string().optional(),
  attributes: z.array(OAuthAttributesEnum).optional(),
});

export type OAuthVar = z.infer<typeof OAuthVarSchema>;

export const OAuthMappingItemSchema = z.object({
  type: z.string().optional(),
  required: z.boolean().optional(),
  store: OAuthVarStoreEnum,
  key: z.string(),
});

export type OAuthMappingItem = z.infer<typeof OAuthMappingItemSchema>;

export const OAuthParamsSchema = z.object({
  vars: z.record(z.string(), OAuthVarSchema).optional(),
  mapping: z.record(z.string(), OAuthMappingItemSchema).optional(),
});

export type OAuthParams = z.infer<typeof OAuthParamsSchema>;

export const CounectorOAuthUser = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  picture: z.string().optional(),
});

export const ConnectorOAuthStatusSchema = z.object({
  isValid: z.boolean(),
  expiresAt: z.date().optional(),
  user: CounectorOAuthUser.optional(),
  additional: z.record(z.unknown()).optional(),
});

export type ConnectorOAuthStatusSchema = z.infer<typeof ConnectorOAuthStatusSchema>;

export const ConnectorOAuthSettingsSchema = z.object({
  vars: z.record(z.unknown()),
});

export type ConnectorOAuthSettingsSchema = z.infer<typeof ConnectorOAuthSettingsSchema>;

export const ConnectorOAuthExchangeResultSchema = z.object({
  success: z.boolean(),
  credentialId: z.string(),
  user: CounectorOAuthUser.optional(),
  additional: z.record(z.unknown()).optional(),
  reasons: z.array(z.string()).optional(),
});

export type ConnectorOAuthExchangeResultSchema = z.infer<typeof ConnectorOAuthExchangeResultSchema>;
