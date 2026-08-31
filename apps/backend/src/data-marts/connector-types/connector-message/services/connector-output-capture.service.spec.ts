import { ConnectorMessageType } from '../../enums/connector-message-type-enum';
import { ConnectorMessage } from '../schemas/connector-message.schema';
import { ConnectorMessageParserService } from './connector-message-parser.service';
import { ConnectorOutputCaptureService } from './connector-output-capture.service';

/**
 * Uses the real parser rather than a mock: the value here is the contract between the
 * connector's stderr envelope and the type the executor switches on, and a mock would
 * assert nothing about it.
 */
describe('ConnectorOutputCaptureService', () => {
  const capture = (stream: 'onStdout' | 'onStderr', raw: string): ConnectorMessage[] => {
    const service = new ConnectorOutputCaptureService(new ConnectorMessageParserService());
    const received: ConnectorMessage[] = [];
    service
      .createCapture(
        message => received.push(message),
        () => undefined
      )
      .logCapture[stream](raw);
    return received;
  };

  it('keeps the warning type of a structured stderr envelope', () => {
    const [message] = capture(
      'onStderr',
      '{"type":"addWarningToCurrentStatus","at":"2026-07-27T14:16:21.365Z","warning":"Session has expired"}'
    );

    expect(message.type).toBe(ConnectorMessageType.WARNING);
  });

  it('keeps the error type of a structured stderr envelope', () => {
    const [message] = capture(
      'onStderr',
      '{"type":"error","at":"2026-07-27T14:16:21.365Z","error":"Unexpected end of script"}'
    );

    expect(message.type).toBe(ConnectorMessageType.ERROR);
  });

  it('wraps unparsed stderr text as an error', () => {
    const [message] = capture('onStderr', 'TypeError: something exploded');

    expect(message.type).toBe(ConnectorMessageType.ERROR);
    expect(message.toFormattedString()).toContain('something exploded');
  });

  it('keeps a multi-line stack inside a single message', () => {
    const stack = 'HttpRequestException: expired\n    at _validateResponse\n    at async run';
    const messages = capture(
      'onStderr',
      JSON.stringify({ type: 'addWarningToCurrentStatus', at: 'now', warning: stack })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].toFormattedString()).toContain('at async run');
  });

  it('still splits genuinely separate envelopes written back to back', () => {
    const messages = capture(
      'onStderr',
      '{"type":"error","at":"now","error":"first"}{"type":"error","at":"now","error":"second"}'
    );

    expect(messages).toHaveLength(2);
  });

  it('keeps an envelope intact when its message contains a brace sequence', () => {
    // A provider error or a stack trace can legitimately contain '}{'. Splitting on it
    // produced two unparseable fragments instead of one classified entry.
    const messages = capture(
      'onStderr',
      JSON.stringify({ type: 'error', at: 'now', error: 'malformed payload: }{ near token' })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe(ConnectorMessageType.ERROR);
    expect(messages[0].toFormattedString()).toContain('}{ near token');
  });

  it('keeps raw text containing a brace sequence as one entry', () => {
    const messages = capture('onStderr', 'SyntaxError: unexpected }{ in input');

    expect(messages).toHaveLength(1);
    expect(messages[0].toFormattedString()).toContain('unexpected }{ in input');
  });

  it('parses the warning envelope NodeJsConfig actually emits', () => {
    // Built the same way the connector builds it, so a field rename on either side
    // fails here instead of silently degrading the message to unknown.
    const at = new Date().toISOString();
    const emitted = JSON.stringify({
      type: 'addWarningToCurrentStatus',
      at: `${at.split('T')[0]} ${at.split('T')[1].split('.')[0]}`,
      warning: '2 out of 3 advertisers had errors',
    });

    const [message] = capture('onStdout', emitted);

    expect(message.type).toBe(ConnectorMessageType.WARNING);
    expect(message.toFormattedString()).toContain('2 out of 3 advertisers had errors');
  });
});

describe('ConnectorOutputCaptureService message framing', () => {
  const service = new ConnectorOutputCaptureService(new ConnectorMessageParserService());

  function capture() {
    const messages: unknown[] = [];
    const cap = service.createCapture(
      m => messages.push(m),
      () => undefined
    );
    return { cap, messages };
  }

  const logLine = (message: string) =>
    JSON.stringify({ type: 'log', at: '2026-07-04T00:00:00.000Z', message });

  describe('cleanMessage (via onStdout)', () => {
    it('parses a single valid NDJSON line whose message value contains a literal "}{" as ONE entry with the message intact', () => {
      const { cap, messages } = capture();
      const line = logLine('status went from }{ to normal');

      cap.logCapture.onStdout(line);

      expect(messages).toHaveLength(1);
      const msg = messages[0] as { type: string; toFormattedString: () => string };
      expect(msg.type).toBe(ConnectorMessageType.LOG);
      expect(msg.toFormattedString()).toBe('[LOG] status went from }{ to normal');
    });

    it('trims surrounding whitespace before parsing', () => {
      const { cap, messages } = capture();
      cap.logCapture.onStdout(`  ${logLine('padded')}  \n`);

      expect(messages).toHaveLength(1);
      const msg = messages[0] as { toFormattedString: () => string };
      expect(msg.toFormattedString()).toBe('[LOG] padded');
    });

    it('drops an empty/whitespace-only message and emits nothing', () => {
      const { cap, messages } = capture();
      cap.logCapture.onStdout('   ');
      cap.logCapture.onStdout('');

      expect(messages).toHaveLength(0);
    });

    it('parses two separate onStdout calls (as the spawner delivers one already-framed line per call) as two entries', () => {
      // ConnectorProcessSpawnerService's line buffer frames stdout/stderr into
      // individual `\n`-delimited lines upstream, so onStdout is invoked once
      // per line — cleanMessage itself no longer splits on embedded newlines.
      const { cap, messages } = capture();
      cap.logCapture.onStdout(logLine('first'));
      cap.logCapture.onStdout(logLine('second'));

      expect(messages).toHaveLength(2);
      const [a, b] = messages as { toFormattedString: () => string }[];
      expect(a.toFormattedString()).toBe('[LOG] first');
      expect(b.toFormattedString()).toBe('[LOG] second');
    });
  });

  describe('onStderr (captureError)', () => {
    // Only unparsed raw text is wrapped as a plain ERROR — a structured envelope keeps
    // its own type, which the suite above covers.
    it('wraps unparsed stderr text as an ERROR message, preserving the literal "}{"', () => {
      const { cap, messages } = capture();
      cap.logCapture.onStderr('boom }{ boom');

      expect(messages).toHaveLength(1);
      const msg = messages[0] as { type: string; error: string; toFormattedString: () => string };
      expect(msg.type).toBe(ConnectorMessageType.ERROR);
      expect(msg.error).toContain('boom }{ boom');
      expect(msg.toFormattedString()).toMatch(/^\[ERROR\] .*boom \}\{ boom$/);
    });
  });
});
