import { createHash, randomBytes } from 'node:crypto';

export function createExecutionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashExecutionToken(token) };
}

export function hashExecutionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
