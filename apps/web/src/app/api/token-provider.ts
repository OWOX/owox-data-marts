/**
 * TokenProvider - provides access tokens from AuthContext to apiClient
 * Replaces direct access to global variables
 */
export interface TokenProvider {
  getAccessToken(): string | null;
  refreshToken(): Promise<string>;
  getProjectId?(): string | null;
  getUserId?(): string | null;
}

/**
 * Default token provider that can be injected into apiClient
 */
export class DefaultTokenProvider implements TokenProvider {
  private getToken: () => string | null;
  private refreshFn: () => Promise<string>;
  private getProject: () => string | null;
  private getUser: () => string | null;

  constructor(
    getToken: () => string | null,
    refreshFn: () => Promise<string>,
    getProject: () => string | null = () => null,
    getUser: () => string | null = () => null
  ) {
    this.getToken = getToken;
    this.refreshFn = refreshFn;
    this.getProject = getProject;
    this.getUser = getUser;
  }

  getAccessToken(): string | null {
    return this.getToken();
  }

  getProjectId(): string | null {
    return this.getProject();
  }

  getUserId(): string | null {
    return this.getUser();
  }

  async refreshToken(): Promise<string> {
    return await this.refreshFn();
  }
}

/**
 * Global token provider instance
 * Will be set by AuthContext
 */
let globalTokenProvider: TokenProvider | null = null;

/**
 * Set the global token provider (called by AuthContext)
 */
export function setTokenProvider(provider: TokenProvider): void {
  globalTokenProvider = provider;
}

/**
 * Get the global token provider
 */
export function getTokenProvider(): TokenProvider | null {
  return globalTokenProvider;
}

/**
 * Clear the global token provider
 */
export function clearTokenProvider(): void {
  globalTokenProvider = null;
}
