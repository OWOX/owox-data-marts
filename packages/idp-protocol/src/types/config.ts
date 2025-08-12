/**
 * Configuration for the IDP provider
 */
export interface IdpConfig {
  /**
   * Base URL for the IDP provider
   */
  baseUrl: string;

  /**
   * Additional provider-specific configuration
   */
  [key: string]: unknown;
}
