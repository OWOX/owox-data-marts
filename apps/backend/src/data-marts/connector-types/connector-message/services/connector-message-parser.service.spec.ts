import { Logger } from '@nestjs/common';
import { ConnectorMessageParserService } from './connector-message-parser.service';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';

describe('ConnectorMessageParserService', () => {
  const service = new ConnectorMessageParserService();

  describe('credential redaction', () => {
    it('redacts malformed credential update messages parsed as unknown', () => {
      const result = service.parse(
        '{"type":"updateCredentials","credentials":{"generated_refresh_token":"secret-token"'
      );

      expect(result!.type).toBe(ConnectorMessageType.UNKNOWN);
      expect(result!.toFormattedString()).toContain('[REDACTED updateCredentials message]');
      expect(result!.toFormattedString()).not.toContain('secret-token');
    });

    it('redacts schema-invalid credential update messages parsed as unknown', () => {
      const result = service.parse(
        JSON.stringify({
          type: ConnectorMessageType.CREDENTIALS_UPDATE,
          credentials: { generated_refresh_token: 'secret-token' },
        })
      );

      expect(result!.type).toBe(ConnectorMessageType.UNKNOWN);
      expect(result!.toFormattedString()).toContain('[REDACTED updateCredentials message]');
      expect(result!.toFormattedString()).not.toContain('secret-token');
    });

    /**
     * Credential content hidden under another message type must not reach either sink:
     * the run-history message keeps its explicit redaction marker, and the log now
     * carries no payload values at all, so there is nothing there left to redact.
     */
    it('keeps credential content out of both the log and the run-history message when it hides under another type', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      try {
        const result = service.parse(
          JSON.stringify({
            type: ConnectorMessageType.LOG,
            message: 'hello',
            credentials: { generated_refresh_token: 'secret-token' },
          })
        );

        expect(result!.type).toBe(ConnectorMessageType.UNKNOWN);
        expect(result!.toFormattedString()).toContain('[REDACTED updateCredentials message]');
        expect(result!.toFormattedString()).not.toContain('secret-token');
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('secret-token');
      } finally {
        warnSpy.mockRestore();
      }
    });

    /**
     * The schema-validation warning used to put the complete raw line AND the complete
     * parsed object into pino metadata, redacted only when the message was
     * credential-shaped. A connector line is whatever an API we do not control echoed
     * back, so anything else in it went to log aggregation verbatim, with no `redact`
     * configuration anywhere to catch it.
     *
     * No emitter carries third-party records down this path today, so this is an
     * unguarded mechanism rather than a live leak — but the guard belongs on the
     * mechanism. What a schema failure needs is the shape and the validator's own
     * complaint, never the values.
     */
    it('describes a rejected message by shape and length, never by its values', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      try {
        const result = service.parse(
          JSON.stringify({
            type: ConnectorMessageType.LOG,
            message: 'hello',
            customer_email: 'person@example.com',
            records: [{ card: '4111111111111111' }],
          })
        );

        expect(result!.type).toBe(ConnectorMessageType.UNKNOWN);
        const logged = JSON.stringify(warnSpy.mock.calls);
        expect(logged).not.toContain('person@example.com');
        expect(logged).not.toContain('4111111111111111');
        // The field NAMES are schema, not data, and are what makes the failure diagnosable.
        expect(logged).toContain('customer_email');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('translates a CREDENTIALS event into a CREDENTIALS_UPDATE message (engine→host contract)', () => {
      // Exact CREDENTIALS event shape emitted by AbstractContext.updateCredentials.
      const result = service.parse(
        JSON.stringify({
          type: 'CREDENTIALS',
          timestamp: '2026-06-24T12:00:00.000Z',
          credentials: { generated_refresh_token: 'rotated-token' },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.CREDENTIALS_UPDATE);
      expect((result as unknown as { credentials: Record<string, unknown> }).credentials).toEqual({
        generated_refresh_token: 'rotated-token',
      });
    });
  });

  describe('legacy lowercase format (backward compatibility)', () => {
    it('parses legacy log message', () => {
      const result = service.parse(
        JSON.stringify({
          type: ConnectorMessageType.LOG,
          at: '2026-01-01T00:00:00.000Z',
          message: 'hello',
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect(result!.toFormattedString()).toBe('[LOG] hello');
    });

    it('parses legacy updateLastRequstedDate as REQUESTED_DATE', () => {
      const result = service.parse(
        JSON.stringify({
          type: ConnectorMessageType.REQUESTED_DATE,
          at: '2026-01-01T00:00:00.000Z',
          date: '2026-01-15',
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.REQUESTED_DATE);
    });

    it('parses legacy updateCurrentStatus as STATUS', () => {
      const result = service.parse(
        JSON.stringify({
          type: ConnectorMessageType.STATUS,
          at: '2026-01-01T00:00:00.000Z',
          status: 3,
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.STATUS);
    });

    it('formats a numeric STATUS as a readable label', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'updateCurrentStatus',
          at: '2026-05-14T00:00:00.000Z',
          status: 3,
        })
      );
      expect(result).not.toBeNull();
      expect(result!.toFormattedString()).toBe('[STATUS] Import done');
    });

    it('falls back to the number for an unknown STATUS', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'updateCurrentStatus',
          at: '2026-05-14T00:00:00.000Z',
          status: 99,
        })
      );
      expect(result).not.toBeNull();
      expect(result!.toFormattedString()).toBe('[STATUS] 99');
    });

    it('falls back to UNKNOWN for non-JSON input', () => {
      const result = service.parse('not json');
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.UNKNOWN);
    });
  });

  describe('new uppercase Event protocol', () => {
    const ts = '2026-05-02T12:00:00.000Z';

    it('translates LOG (info) to legacy LOG', () => {
      const result = service.parse(
        JSON.stringify({ type: 'LOG', timestamp: ts, level: 'info', message: 'starting' })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect(result!.at).toBe(ts);
      expect(result!.toFormattedString()).toBe('[LOG] starting');
    });

    it('translates LOG (warn) to legacy WARNING', () => {
      const result = service.parse(
        JSON.stringify({ type: 'LOG', timestamp: ts, level: 'warn', message: 'careful' })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.WARNING);
      expect(result!.toFormattedString()).toBe('[WARNING] careful');
    });

    it('translates LOG (error) to legacy ERROR', () => {
      const result = service.parse(
        JSON.stringify({ type: 'LOG', timestamp: ts, level: 'error', message: 'boom' })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.ERROR);
      expect(result!.toFormattedString()).toBe('[ERROR] boom');
    });

    it('translates CONTROL.started to LOG marker', () => {
      const result = service.parse(
        JSON.stringify({ type: 'CONTROL', timestamp: ts, action: 'started' })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect(result!.toFormattedString()).toBe('[LOG] [CONTROL] started');
    });

    it('translates CONTROL.completed to STATUS with IMPORT_DONE(3)', () => {
      const result = service.parse(
        JSON.stringify({ type: 'CONTROL', timestamp: ts, action: 'completed' })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.STATUS);
      // STATUS message exposes a numeric status; 3 = IMPORT_DONE per legacy
      // packages/connectors/src/Constants/CommonConstants.js EXECUTION_STATUS.
      expect((result as unknown as { status: number }).status).toBe(3);
    });

    it('translates CONTROL.failed to ERROR with provided error string', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'CONTROL',
          timestamp: ts,
          action: 'failed',
          error: 'connector exploded',
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.ERROR);
      expect(result!.toFormattedString()).toBe('[ERROR] connector exploded');
    });

    it('translates CONTROL.failed without error to ERROR with default text', () => {
      const result = service.parse(
        JSON.stringify({ type: 'CONTROL', timestamp: ts, action: 'failed' })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.ERROR);
      expect(result!.toFormattedString()).toContain('Connector reported failure');
    });

    it('translates STATE with lastRequestedDate to REQUESTED_DATE', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'STATE',
          timestamp: ts,
          state: { lastRequestedDate: '2026-04-30' },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.REQUESTED_DATE);
      expect((result as unknown as { date: string }).date).toBe('2026-04-30');
    });

    it('translates STATE without lastRequestedDate to LOG fallback', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'STATE',
          timestamp: ts,
          state: { someOtherField: 'x' },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect(result!.toFormattedString()).toContain('[STATE]');
    });

    it('translates TRACE to LOG bucket with tagged message', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'TRACE',
          timestamp: ts,
          action: 'http.request',
          details: { url: '/foo' },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect(result!.toFormattedString()).toContain('[TRACE] http.request');
    });

    it('translates ANALYTICS to LOG bucket with tagged message', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'ANALYTICS',
          timestamp: ts,
          metric: 'rows.processed',
          value: 1234,
          tags: { node: 'orders' },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect(result!.toFormattedString()).toContain('[ANALYTICS] rows.processed=1234');
    });

    it('preserves eventType=LOG on a translated info log', () => {
      const result = service.parse(
        JSON.stringify({ type: 'LOG', timestamp: ts, level: 'info', message: 'x' })
      );
      expect((result as unknown as { eventType?: string }).eventType).toBe('LOG');
    });

    it('preserves eventType=TRACE through the collapsed log bucket', () => {
      const result = service.parse(
        JSON.stringify({ type: 'TRACE', timestamp: ts, action: 'http.request', details: {} })
      );
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      expect((result as unknown as { eventType?: string }).eventType).toBe('TRACE');
    });

    it('preserves eventType=ANALYTICS through the collapsed log bucket', () => {
      const result = service.parse(
        JSON.stringify({ type: 'ANALYTICS', timestamp: ts, metric: 'rows', value: 1 })
      );
      expect((result as unknown as { eventType?: string }).eventType).toBe('ANALYTICS');
    });

    it('preserves analytics metric/value/tags on the translated message', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'ANALYTICS',
          timestamp: ts,
          metric: 'rows_written',
          value: 1234,
          tags: { node: 'campaigns' },
        })
      );
      expect(result!.type).toBe(ConnectorMessageType.LOG);
      const r = result as unknown as {
        metric?: string;
        value?: unknown;
        tags?: Record<string, unknown>;
      };
      expect(r.metric).toBe('rows_written');
      expect(r.value).toBe(1234);
      expect(r.tags).toEqual({ node: 'campaigns' });
    });

    it('preserves eventType=CONTROL on a lifecycle marker', () => {
      const result = service.parse(
        JSON.stringify({ type: 'CONTROL', timestamp: ts, action: 'started' })
      );
      expect((result as unknown as { eventType?: string }).eventType).toBe('CONTROL');
    });

    it('preserves eventType=CONTROL on a completed→STATUS message', () => {
      const result = service.parse(
        JSON.stringify({ type: 'CONTROL', timestamp: ts, action: 'completed' })
      );
      expect(result!.type).toBe(ConnectorMessageType.STATUS);
      expect((result as unknown as { eventType?: string }).eventType).toBe('CONTROL');
    });

    it('preserves eventType=STATE on a requested-date message', () => {
      const result = service.parse(
        JSON.stringify({ type: 'STATE', timestamp: ts, state: { lastRequestedDate: '2026-04-30' } })
      );
      expect(result!.type).toBe(ConnectorMessageType.REQUESTED_DATE);
      expect((result as unknown as { eventType?: string }).eventType).toBe('STATE');
    });

    it('does not add eventType to legacy lowercase messages', () => {
      const result = service.parse(JSON.stringify({ type: 'log', at: ts, message: 'legacy' }));
      expect((result as unknown as { eventType?: string }).eventType).toBeUndefined();
    });

    it('drops DATA events from the message stream', () => {
      const result = service.parse(
        JSON.stringify({
          type: 'DATA',
          timestamp: ts,
          node: 'orders',
          records: [{ id: 1 }],
          schema: {},
        })
      );
      expect(result).toBeNull();
    });

    it('falls back to current time when timestamp is missing', () => {
      const before = Date.now();
      const result = service.parse(
        JSON.stringify({ type: 'LOG', level: 'info', message: 'no ts' })
      );
      const after = Date.now();
      expect(result).not.toBeNull();
      const at = new Date(result!.at).getTime();
      expect(at).toBeGreaterThanOrEqual(before);
      expect(at).toBeLessThanOrEqual(after);
    });
  });
});
