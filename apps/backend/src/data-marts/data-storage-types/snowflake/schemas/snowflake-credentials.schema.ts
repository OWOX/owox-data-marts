import { z } from 'zod';
import { SnowflakeAuthMethod } from '../enums/snowflake-auth-method.enum';

export const SnowflakePasswordCredentialsSchema = z.object({
  authMethod: z.literal(SnowflakeAuthMethod.PASSWORD),
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

export const SnowflakeKeyPairCredentialsSchema = z.object({
  authMethod: z.literal(SnowflakeAuthMethod.KEY_PAIR),
  username: z.string().min(1, 'username is required'),
  privateKey: z.string().min(1, 'privateKey is required'),
  privateKeyPassphrase: z.string().optional(),
});

export const SnowflakeCredentialsSchema = z.discriminatedUnion('authMethod', [
  SnowflakePasswordCredentialsSchema,
  SnowflakeKeyPairCredentialsSchema,
]);

export type SnowflakePasswordCredentials = z.infer<typeof SnowflakePasswordCredentialsSchema>;
export type SnowflakeKeyPairCredentials = z.infer<typeof SnowflakeKeyPairCredentialsSchema>;
export type SnowflakeCredentials = z.infer<typeof SnowflakeCredentialsSchema>;
