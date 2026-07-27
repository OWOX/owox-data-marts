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
});
