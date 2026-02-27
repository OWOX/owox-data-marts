import type { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import type { GoogleOAuthTokens } from '../services/google-oauth/google-oauth-flow.service';

/**
 * Union of all credential shapes actually stored in the
 * data_destination_credentials JSON column.
 *
 * Includes GoogleOAuthTokens for OAuth-authenticated destinations
 * (e.g. Google Sheets with user OAuth).
 */
export type StoredDestinationCredentials = DataDestinationCredentials | GoogleOAuthTokens;
