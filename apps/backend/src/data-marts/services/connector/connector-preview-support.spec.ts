import { Logger } from '@nestjs/common';
import { createConnectorPreviewSource } from './connector-preview-support';

interface PreviewParameter {
  value?: unknown;
  items?: Record<string, { value?: unknown }>;
}

interface PreviewContext {
  getParameter(name: string): PreviewParameter | null;
  validate(): void;
}

// Runs the real @owox/connectors: both preview services mock it, which is how a raw
// configuration reaching the source went unnoticed.
describe('createConnectorPreviewSource', () => {
  it('gives the source its configuration in the shape a run gives it', () => {
    const source = createConnectorPreviewSource(
      'GoogleSheets',
      {
        AuthType: { service_account: { ServiceAccountKey: '{"client_email":"sa@example.com"}' } },
        SpreadsheetId: 'spreadsheet-id',
        SheetName: 'Sheet1',
      },
      new Logger('ConnectorPreviewSupportSpec')
    ) as unknown as { context: PreviewContext };

    const authType = source.context.getParameter('AuthType');
    expect(authType?.value).toBe('service_account');
    expect(authType?.items?.ServiceAccountKey?.value).toBe('{"client_email":"sa@example.com"}');
    expect(() => source.context.validate()).not.toThrow();
  });
});
