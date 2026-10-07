import { GoogleSheetsCredentialsValidator } from './google-sheets/services/google-sheets-credentials-validator';
import { EmailCredentialsValidator } from './ee/email/services/email-credentials-validator';
import { GoogleChatCredentialsValidator } from './ee/google-chat/services/google-chat-credentials-validator';
import type { DataDestinationCredentialsValidator } from './interfaces/data-destination-credentials-validator.interface';
import type { DataDestinationCredentials } from './data-destination-credentials.type';

/**
 * The destination form highlights an input only from `reason.fieldErrors`, named by the value's
 * path in the save request. Pins that the credential validators report schema failures that way;
 * every case here fails the schema, so no Google API is called.
 */
const cases: [string, DataDestinationCredentialsValidator, unknown, string][] = [
  [
    'Google Sheets',
    new GoogleSheetsCredentialsValidator(),
    {
      type: 'google-sheets-credentials',
      serviceAccountKey: { type: 'service_account', client_email: 'sa@p.iam.gserviceaccount.com' },
    },
    'credentials.serviceAccountKey.private_key',
  ],
  [
    'Email',
    new EmailCredentialsValidator(),
    { type: 'email-credentials', to: ['not-an-email'] },
    'credentials.to.0',
  ],
  [
    'Google Chat',
    new GoogleChatCredentialsValidator(),
    { type: 'google-chat-credentials', webhookUrl: 'https://example.com/hook' },
    'credentials.webhookUrl',
  ],
];

describe.each(cases)('%s credentials validator', (_name, validator, credentials, field) => {
  it(`names the rejected value as ${field}`, async () => {
    const result = await validator.validate(credentials as DataDestinationCredentials);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/^Invalid credentials — /);
    const fieldErrors = (result.reason as { fieldErrors: { field: string }[] }).fieldErrors;
    expect(fieldErrors.map(error => error.field)).toContain(field);
  });
});
