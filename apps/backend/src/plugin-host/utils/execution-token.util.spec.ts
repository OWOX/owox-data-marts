import { createExecutionToken, hashExecutionToken } from './execution-token.util';

describe('execution token', () => {
  it('is 256 random bits whose SHA-256 is stored instead of the token', () => {
    const { token, tokenHash } = createExecutionToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashExecutionToken(token)).toBe(tokenHash);
  });

  it('never repeats', () => {
    expect(createExecutionToken().token).not.toBe(createExecutionToken().token);
  });

  it('hashes with SHA-256', () => {
    expect(hashExecutionToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
