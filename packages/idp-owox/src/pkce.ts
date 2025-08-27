import crypto from 'node:crypto';
import pkceChallenge from 'pkce-challenge';

export interface PkceDto {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generates a PKCE (Proof Key for Code Exchange) pair consisting of a code verifier and a code challenge.
 *
 * @param {number} [length=86] - The desired length of the code verifier. Defaults to 86 if not specified.
 * @return {Promise<{codeVerifier: string, codeChallenge: string}>} A promise that resolves to an object containing the code verifier and code challenge.
 */
export async function generatePkce(length: number = 86): Promise<PkceDto> {
  const { code_verifier, code_challenge } = await pkceChallenge(length);
  return { codeVerifier: code_verifier, codeChallenge: code_challenge };
}

/**
 * Generates a random string state encoded in Base64 URL format.
 * Optionally allows truncation of the generated state to a specific length.
 *
 * @param {number} [bytes=32] - The number of random bytes to generate.
 * @param {number} [targetLen] - The desired length of the output string. If not specified, the full generated string is returned.
 * @return {string} - A randomly generated Base64 URL-encoded string. If targetLen is provided, returns a substring of the specified length.
 */
export function generateState(bytes: number = 32, targetLen?: number): string {
  const state = base64url(crypto.randomBytes(bytes));
  return targetLen ? state.slice(0, targetLen) : state;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
