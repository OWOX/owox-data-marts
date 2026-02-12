import { TokenType } from './tokenType.js';

/** Token revocation request payload. */
export interface RevocationRequest {
  token: string;
  tokenType?: TokenType;
}

/** Token revocation response payload. */
export interface RevocationResponse {
  success: boolean;
}
