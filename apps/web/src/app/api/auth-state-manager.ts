/**
 * Shares an in-flight refresh without retaining a token outside its provider.
 */
export class AuthStateManager {
  private refreshTokenPromise: Promise<string> | null = null;

  async refreshToken(refreshFn: () => Promise<string>): Promise<string> {
    if (this.refreshTokenPromise) {
      return await this.refreshTokenPromise;
    }

    const pending = refreshFn();
    this.refreshTokenPromise = pending;

    try {
      return await pending;
    } finally {
      if (this.refreshTokenPromise === pending) {
        this.refreshTokenPromise = null;
      }
    }
  }

  clear(): void {
    this.refreshTokenPromise = null;
  }
}
