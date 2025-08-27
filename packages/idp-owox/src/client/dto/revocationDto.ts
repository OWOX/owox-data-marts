import { TokenType } from './tokenType';

export interface RevocationRequest {
  token: string;
  tokenType?: TokenType;
}

export interface RevocationResponse {
  success: boolean;
}
