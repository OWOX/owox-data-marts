import { TokenType } from './tokenType.js';

export interface RevocationRequest {
  token: string;
  tokenType?: TokenType;
}

export interface RevocationResponse {
  success: boolean;
}
