import { betterAuth } from 'better-auth';

export class MagicLinkService {
  private static readonly DEFAULT_CALLBACK_URL = '/auth/magic-link-success';

  constructor(private readonly auth: Awaited<ReturnType<typeof betterAuth>>) {}

  async generateMagicLink(email: string): Promise<void> {
    // Generate magic link directly through Better Auth internals
    const baseURL = this.auth.options.baseURL || 'http://localhost:3000';

    const callbackURL = `${baseURL}${MagicLinkService.DEFAULT_CALLBACK_URL}`;
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
  }
}
