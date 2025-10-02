/**
 * AuthStateManager - manages token refresh state for API client
 * Replaces global variables with proper class-based state management
 */
export class AuthStateManager {
  private isRefreshingToken = false;
  private refreshTokenPromise: Promise<string> | null = null;
  private accessToken: string | null = null;

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Set access token
   */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /**
   * Check if currently refreshing token
   */
  isRefreshing(): boolean {
    return this.isRefreshingToken;
  }

  /**
   * Start token refresh process
   * Returns existing promise if already refreshing, or creates new one
   */
  async refreshToken(refreshFn: () => Promise<string>): Promise<string> {
    if (this.isRefreshingToken && this.refreshTokenPromise) {
      return await this.refreshTokenPromise;
    }

    this.isRefreshingToken = true;
    this.refreshTokenPromise = this.performRefresh(refreshFn);

    try {
      const newToken = await this.refreshTokenPromise;
      this.setAccessToken(newToken);
      return newToken;
    } finally {
      this.isRefreshingToken = false;
      this.refreshTokenPromise = null;
    }
  }

  /**
   * Clear all tokens and reset state
   */
  clear(): void {
    this.accessToken = null;
    this.isRefreshingToken = false;
    this.refreshTokenPromise = null;
  }

  /**
   * Internal method to perform token refresh
   */
  private async performRefresh(refreshFn: () => Promise<string>): Promise<string> {
    try {
      return await refreshFn();
    } catch (error) {
      this.clear();
      throw error;
    }
  }
}
