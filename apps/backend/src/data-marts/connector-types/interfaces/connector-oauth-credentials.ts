import { z } from 'zod';

export interface ConnectorOauthCredentials {
  user: {
    id: string;
    name: string;
  };
  secret: Record<string, unknown>;
  expiresIn: number;
  additional: Record<string, unknown>;
  warnings: string[];
}

export const ConnectorOauthCredentialsSchema = z.object({
  user: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  secret: z.record(z.string(), z.unknown()),
  expiresIn: z.number().optional(),
  additional: z.record(z.unknown()).optional(),
  warnings: z.array(z.string()).optional(),
});
