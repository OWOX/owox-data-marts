import { z } from 'zod';

export type GrantType = 'authorization_code' | 'refresh_token';

export interface TokenRequest {
  grantType: GrantType;
  clientId: string;
  authCode?: string;
  refreshToken?: string;
  codeVerifier?: string;
}

export const TokenResponseSchema = z.object({
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  tokenType: z.string(),
  accessTokenExpiresIn: z.number().positive(),
  refreshTokenExpiresIn: z.number().positive(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;
