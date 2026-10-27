import { ApiService } from '../../../services';

export interface OAuthSettings {
  available: boolean;
  clientId?: string;
  /** Drive Picker API key (destination only) — enables the folder picker. */
  pickerApiKey?: string;
}

class DestinationOAuthApiService extends ApiService {
  constructor() {
    super('/data-destinations');
  }

  getSettings(): Promise<OAuthSettings> {
    return this.get<OAuthSettings>('/oauth/settings');
  }
}

export const destinationOAuthApi = new DestinationOAuthApiService();
