import { LoggerTransport } from './logger-transport.js';
import { BaseEvent } from '../base-event.js';
import type { Logger } from '../../../logging/types.js';

// BaseEvent freezes `this`, so the name can't be an instance field — carry it in the payload.
class Ev extends BaseEvent<Record<string, unknown>> {
  constructor(name: string) {
    super({ __eventName: name });
  }
  get name() {
    return String(this.payload['__eventName']);
  }
}

const fakeLogger = (name: string, sink: Array<{ name: string; msg: string }>): Logger =>
  ({
    info: (msg: string) => sink.push({ name, msg }),
    debug: () => {},
    warn: () => {},
    error: () => {},
    trace: () => {},
  }) as unknown as Logger;

describe('LoggerTransport', () => {
  it('logs under the default name when no resolver is given', async () => {
    const sink: Array<{ name: string; msg: string }> = [];
    const t = new LoggerTransport(n => fakeLogger(n, sink), 'EventBus');
    await t.send(new Ev('insights.something'));
    expect(sink).toEqual([{ name: 'EventBus', msg: 'Event' }]);
  });

  it('routes each event to the name returned by resolveLoggerName', async () => {
    const sink: Array<{ name: string; msg: string }> = [];
    const t = new LoggerTransport(n => fakeLogger(n, sink), 'EventBus', {
      resolveLoggerName: e => (e.name.startsWith('mcp.') ? 'McpEventBus' : undefined),
    });
    await t.send(new Ev('mcp.tool_call'));
    await t.send(new Ev('insights.something'));
    expect(sink.map(s => s.name)).toEqual(['McpEventBus', 'EventBus']);
  });

  it('creates each named logger once and reuses it', async () => {
    const created: string[] = [];
    const sink: Array<{ name: string; msg: string }> = [];
    const t = new LoggerTransport(
      n => {
        created.push(n);
        return fakeLogger(n, sink);
      },
      'EventBus',
      { resolveLoggerName: () => 'McpEventBus' }
    );
    await t.send(new Ev('mcp.a'));
    await t.send(new Ev('mcp.b'));
    expect(created).toEqual(['McpEventBus']);
  });
});
