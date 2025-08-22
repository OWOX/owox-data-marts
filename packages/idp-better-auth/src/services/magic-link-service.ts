import { betterAuth } from 'better-auth';
import { CryptoService } from './crypto-service.js';

export class MagicLinkService {
  private static readonly DEFAULT_CALLBACK_URL = '/auth/magic-link-success';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof betterAuth>>,
    private readonly cryptoService: CryptoService
  ) {}

  async generateMagicLink(
    email: string,
    role: 'admin' | 'editor' | 'viewer' = 'admin'
  ): Promise<string> {
    // Clear previous magic link
    delete (global as unknown as { lastMagicLink?: string }).lastMagicLink;

    // Generate magic link directly through Better Auth internals
    const baseURL = this.auth.options.baseURL || 'http://localhost:3000';
    const encodedRole = await this.cryptoService.encrypt(role);

    const callbackURL = `${baseURL}${MagicLinkService.DEFAULT_CALLBACK_URL}?role=${encodedRole}`;
    // Create a mock Request object for Better Auth
    const mockRequest = new Request(`${baseURL}/auth/better-auth/sign-in/magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        callbackURL: callbackURL,
      }),
    });

    // Call Better Auth handler directly
    const response = await this.auth.handler(mockRequest);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Magic link generation failed: ${response.status} ${errorText}`);
    }

    // Wait a moment for the sendMagicLink callback to be called
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get the generated magic link from global storage
    const magicLink = (global as unknown as { lastMagicLink?: string }).lastMagicLink;

    if (!magicLink) {
      throw new Error('Magic link generation failed - no link received');
    }

    return magicLink;
  }
}
