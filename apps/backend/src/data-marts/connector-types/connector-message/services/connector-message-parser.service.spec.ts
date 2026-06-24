import { Logger } from '@nestjs/common';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';
import { ConnectorMessageParserService } from './connector-message-parser.service';

describe('ConnectorMessageParserService', () => {
  const createService = () => new ConnectorMessageParserService();

  it('redacts malformed credential update messages parsed as unknown', () => {
    const service = createService();

    const result = service.parse(
      '{"type":"updateCredentials","credentials":{"generated_refresh_token":"secret-token"'
    );

    expect(result.type).toBe(ConnectorMessageType.UNKNOWN);
    expect(result.toFormattedString()).toContain('[REDACTED updateCredentials message]');
    expect(result.toFormattedString()).not.toContain('secret-token');
  });

  it('redacts schema-invalid credential update messages parsed as unknown', () => {
    const service = createService();

    const result = service.parse(
      JSON.stringify({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        credentials: { generated_refresh_token: 'secret-token' },
      })
    );

    expect(result.type).toBe(ConnectorMessageType.UNKNOWN);
    expect(result.toFormattedString()).toContain('[REDACTED updateCredentials message]');
    expect(result.toFormattedString()).not.toContain('secret-token');
  });

  it('redacts parsed json when credential content appears under another message type', () => {
    const service = createService();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      const result = service.parse(
        JSON.stringify({
          type: ConnectorMessageType.LOG,
          message: 'hello',
          credentials: { generated_refresh_token: 'secret-token' },
        })
      );

      expect(result.type).toBe(ConnectorMessageType.UNKNOWN);
      expect(JSON.stringify(warnSpy.mock.calls)).toContain('[REDACTED updateCredentials message]');
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('secret-token');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
