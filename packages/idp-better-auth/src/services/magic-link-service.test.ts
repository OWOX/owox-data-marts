import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CryptoService } from './crypto-service.js';
import { MagicLinkService } from './magic-link-service.js';

describe('MagicLinkService', () => {
  beforeEach(() => {
    delete (global as unknown as { lastMagicLink?: string }).lastMagicLink;
  });

  it('carries the encrypted role in the callback path so Better Auth callback query normalization cannot strip it', async () => {
    let capturedBody: { callbackURL: string } | undefined;
    const auth = {
      options: { baseURL: 'http://127.0.0.1:3130' },
      handler: jest.fn(async (request: Request) => {
        const body = (await request.json()) as { callbackURL: string };
        capturedBody = body;
        (global as unknown as { lastMagicLink?: string }).lastMagicLink =
          `${body.callbackURL}?token=generated`;
        return new Response(null, { status: 200 });
      }),
    } as unknown as ConstructorParameters<typeof MagicLinkService>[0];
    const cryptoService = {
      encrypt: jest
        .fn<CryptoService['encrypt']>()
        .mockResolvedValue('encrypted.role_segment-token'),
    } as unknown as CryptoService;

    await new MagicLinkService(auth, cryptoService).generateMagicLink('admin@example.com', 'admin');

    expect(capturedBody?.callbackURL).toBe(
      'http://127.0.0.1:3130/auth/magic-link-success/encrypted.role_segment-token'
    );
    expect(capturedBody?.callbackURL).not.toContain('?role=');
  });
});
