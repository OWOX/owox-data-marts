import { z } from 'zod';

/** OAuth grant types supported by Identity OWOX. */
export type GrantType = 'authorization_code' | 'refresh_token';

/** Token request payload for Identity OWOX. */
export interface TokenRequest {
  grantType: GrantType;
  clientId: string;
  authCode?: string;
  refreshToken?: string;
  codeVerifier?: string;
}

/** Token response schema for Identity OWOX. */
export const TokenResponseSchema = z.object({
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  tokenType: z.string(),
  accessTokenExpiresIn: z.number().positive(),
  refreshTokenExpiresIn: z.number().positive(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;
