import { Logger } from '@nestjs/common';
import { GOOGLE_OAUTH_ENV } from '../../../../test/fixtures/google-oauth';
import { GoogleOAuthConfigService } from './google-oauth-config.service';

function configWith(env: Record<string, string>): GoogleOAuthConfigService {
  const values: Record<string, string> = { ...GOOGLE_OAUTH_ENV, ...env };
  return new GoogleOAuthConfigService({ get: (key: string) => values[key] } as never);
}

describe('GoogleOAuthConfigService scope lists', () => {
  // The service logs each client it configures.
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('drops empty entries, so a trailing comma does not add a required scope', () => {
    const config = configWith({
      OAUTH_GOOGLE_BIGQUERY_SCOPE: 'https://www.googleapis.com/auth/bigquery, openid,,',
      OAUTH_GOOGLE_SHEETS_SCOPE: ',https://www.googleapis.com/auth/spreadsheets,',
    });

    expect(config.getBigQueryScopes()).toEqual([
      'https://www.googleapis.com/auth/bigquery',
      'openid',
    ]);
    expect(config.getSheetsScopes()).toEqual(['https://www.googleapis.com/auth/spreadsheets']);
  });

  it('keeps the default scopes when the variable lists none', () => {
    expect(configWith({ OAUTH_GOOGLE_BIGQUERY_SCOPE: ' , ' }).getBigQueryScopes()).toEqual([
      'https://www.googleapis.com/auth/bigquery',
      'openid',
      'email',
      'profile',
    ]);
  });
});
