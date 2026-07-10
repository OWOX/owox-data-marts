import { jest } from '@jest/globals';
import { OtlpTransport, type OtlpSpanEmitter } from './otlp-transport.js';
import { BaseEvent } from '../base-event.js';

class E extends BaseEvent<Record<string, unknown>> {
  get name() {
    return 'mcp.tool_call';
  }
  constructor(p: Record<string, unknown>) {
    super(p);
  }
}

describe('OtlpTransport', () => {
  it('name = otlp', () => {
    expect(new OtlpTransport(undefined).name).toBe('otlp');
  });

  it('no-op коли emitter відсутній', async () => {
    await expect(new OtlpTransport(undefined).send(new E({ a: 1 }))).resolves.toBeUndefined();
  });

  it('емітить span з плоскими скалярними атрибутами, весь payload передається як є', async () => {
    const calls: { name: string; attrs: Record<string, unknown> }[] = [];
    const emitter: OtlpSpanEmitter = {
      emit: (name, attrs) => calls.push({ name, attrs }),
    };
    await new OtlpTransport(emitter).send(
      new E({ mcp_tool_name: 'q', duration_ms: 5, nested: { x: 1 } })
    );
    expect(calls[0].name).toBe('mcp.tool_call');
    expect(calls[0].attrs['mcp_tool_name']).toBe('q');
    expect(calls[0].attrs['duration_ms']).toBe(5);
    // об'єкти серіалізуються у JSON-рядок
    expect(calls[0].attrs['nested']).toBe('{"x":1}');
  });

  it('пропускає null/undefined значення payload у span-атрибутах', async () => {
    const calls: Record<string, unknown>[] = [];
    const emitter: OtlpSpanEmitter = { emit: (_name, attrs) => calls.push(attrs) };
    await new OtlpTransport(emitter).send(new E({ a: 1, b: null, c: undefined, d: 'x' }));
    expect(calls[0]).toEqual({ a: 1, d: 'x' });
    expect('b' in calls[0]).toBe(false);
    expect('c' in calls[0]).toBe(false);
  });

  it('без mcp_tool_name span іменується event.name', async () => {
    const calls: string[] = [];
    const emitter: OtlpSpanEmitter = { emit: name => calls.push(name) };
    await new OtlpTransport(emitter).send(new E({ duration_ms: 1 }));
    expect(calls).toEqual(['mcp.tool_call']);
  });

  it('uses the injected spanMapper for name/groupId/isError and strips traceparent', async () => {
    const emit = jest.fn();
    const spanMapper = jest.fn(() => ({
      name: 'my_tool',
      groupId: 'conv-1',
      durationMs: 5,
      isError: true,
    }));
    const transport = new OtlpTransport({ emit }, { eventNamePrefixes: ['mcp.'], spanMapper });
    await transport.send({
      name: 'mcp.tool_call',
      occurredAt: '2026-07-10T00:00:00.000Z',
      payload: { owox_conversation_id: 'conv-1', traceparent: '00-aa-bb-01', duration_ms: 5 },
    } as never);
    expect(spanMapper).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'my_tool',
      expect.not.objectContaining({ traceparent: expect.anything() }),
      '2026-07-10T00:00:00.000Z',
      { groupId: 'conv-1', durationMs: 5, isError: true }
    );
  });

  it('defaults to event.name with no mapper', async () => {
    const emit = jest.fn();
    await new OtlpTransport({ emit }).send({
      name: 'x.y',
      occurredAt: '2026-07-10T00:00:00.000Z',
      payload: {},
    } as never);
    expect(emit).toHaveBeenCalledWith('x.y', expect.anything(), '2026-07-10T00:00:00.000Z', {});
  });

  it('passes rootSpanName/groupAttributeKey from transport options through to emit', async () => {
    const emit = jest.fn();
    const transport = new OtlpTransport(
      { emit },
      { rootSpanName: 'mcp.conversation', groupAttributeKey: 'owox_conversation_id' }
    );
    await transport.send(new E({ a: 1 }));
    expect(emit).toHaveBeenCalledWith(
      'mcp.tool_call',
      expect.anything(),
      expect.any(String),
      expect.objectContaining({
        rootSpanName: 'mcp.conversation',
        groupAttributeKey: 'owox_conversation_id',
      })
    );
  });

  it('leaves rootSpanName/groupAttributeKey undefined in emit opts when the transport has no defaults', async () => {
    const emit = jest.fn();
    await new OtlpTransport({ emit }).send(new E({ a: 1 }));
    const opts = emit.mock.calls[0][3] as { rootSpanName?: string; groupAttributeKey?: string };
    expect(opts.rootSpanName).toBeUndefined();
    expect(opts.groupAttributeKey).toBeUndefined();
  });

  it('send не кидає, якщо emitter кинув', async () => {
    const emitter: OtlpSpanEmitter = {
      emit: () => {
        throw new Error('boom');
      },
    };
    await expect(new OtlpTransport(emitter).send(new E({ a: 1 }))).resolves.toBeUndefined();
  });

  it('фільтр префікса: пропускає лише події з mcp.', async () => {
    const calls: string[] = [];
    const emitter: OtlpSpanEmitter = { emit: name => calls.push(name) };
    const t = new OtlpTransport(emitter, { eventNamePrefixes: ['mcp.'] });
    await t.send(new E({})); // name = 'mcp.tool_call' → проходить
    class Other extends BaseEvent<Record<string, unknown>> {
      get name() {
        return 'prompt.processed';
      }
      constructor(p: Record<string, unknown>) {
        super(p);
      }
    }
    await t.send(new Other({})); // відфільтрована
    expect(calls).toEqual(['mcp.tool_call']);
  });
});
