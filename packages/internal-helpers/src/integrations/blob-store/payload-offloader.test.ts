import { jest } from '@jest/globals';
import { PayloadOffloader, OFFLOAD_KEY, type BlobStore } from './payload-offloader.js';

describe('PayloadOffloader', () => {
  it('no-op коли немає зарезервованого ключа', async () => {
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 4096 });
    const payload: Record<string, unknown> = { mcp_tool_name: 't' };
    await offloader.apply(payload);
    expect(payload).toEqual({ mcp_tool_name: 't' });
  });

  it('inline: малий bulky зливається у top-level, ключ прибирається', async () => {
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 4096 });
    const payload: Record<string, unknown> = {
      mcp_tool_name: 't',
      [OFFLOAD_KEY]: { result: { rows: 2 } },
    };
    await offloader.apply(payload);
    expect(payload[OFFLOAD_KEY]).toBeUndefined();
    // Object values are JSON-stringified so a fixed-schema sink sees a stable STRING column.
    expect(payload['result']).toBe('{"rows":2}');
  });

  it('inline: object/array значення стрінгіфаяться, скаляри — як є', async () => {
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 4096 });
    const payload: Record<string, unknown> = {
      [OFFLOAD_KEY]: {
        owox_request_id: 'r1', // scalar string
        returned_rows: 5, // scalar number
        arguments: { filters: [{ value: 'churned' }] }, // polymorphic object → JSON string
        result: [{ a: 1 }], // array → JSON string
      },
    };
    await offloader.apply(payload);
    expect(payload['owox_request_id']).toBe('r1');
    expect(payload['returned_rows']).toBe(5);
    expect(payload['arguments']).toBe('{"filters":[{"value":"churned"}]}');
    expect(payload['result']).toBe('[{"a":1}]');
  });

  it('inline: завеликий bulky не інлайниться, лишає маркери', async () => {
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 8 });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: { big: 'x'.repeat(100) } };
    await offloader.apply(payload);
    expect(payload['owox_payload_truncated']).toBe(true);
    expect(typeof payload['owox_payload_bytes']).toBe('number');
    expect(payload['big']).toBeUndefined();
  });

  it('inline: payload exactly at the byte threshold stays inline (<= boundary)', async () => {
    const blob = { r: 'xxxx' };
    const bytes = Buffer.byteLength(JSON.stringify(blob), 'utf8');
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: bytes });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: blob };
    await offloader.apply(payload);
    expect(payload['r']).toBe('xxxx');
    expect(payload['owox_payload_truncated']).toBeUndefined();
  });

  it('рахує байти UTF-8, не довжину рядка (multibyte понад поріг → truncate)', async () => {
    // '😀' = 4 UTF-8 байти; 5 штук = 20 байт контенту, значно понад 8-байтовий кап.
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 8 });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: { e: '😀😀😀😀😀' } };
    await offloader.apply(payload);
    expect(payload['owox_payload_truncated']).toBe(true);
    expect(payload['owox_payload_bytes'] as number).toBeGreaterThan(8);
  });

  it('none: bulky просто відкидається', async () => {
    const offloader = new PayloadOffloader({ sink: 'none', inlineMaxBytes: 4096 });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: { result: { rows: 2 } } };
    await offloader.apply(payload);
    expect(payload[OFFLOAD_KEY]).toBeUndefined();
    expect(payload['result']).toBeUndefined();
  });

  it('offloads oversized payloads via the injected pathBuilder', async () => {
    const put = jest.fn().mockResolvedValue('gs://bucket/custom/x.json');
    const pathBuilder = jest.fn((p: Record<string, unknown>) => `custom/${String(p['id'])}.json`);
    const offloader = new PayloadOffloader({
      sink: 'gcs',
      inlineMaxBytes: 8,
      blobStore: { put } as unknown as BlobStore,
      pathBuilder,
    });
    const payload: Record<string, unknown> = { id: 'p1', [OFFLOAD_KEY]: { big: 'x'.repeat(5000) } };
    await offloader.apply(payload);
    expect(pathBuilder).toHaveBeenCalledWith(payload);
    expect(put).toHaveBeenCalledWith('custom/p1.json', expect.any(String));
    expect(payload['owox_payload_ref']).toBe('gs://bucket/custom/x.json');
  });

  it('gcs: малий payload (≤ поріг) лишається inline і не вивантажується', async () => {
    const put = jest.fn();
    const offloader = new PayloadOffloader({
      sink: 'gcs',
      inlineMaxBytes: 4096,
      blobStore: { put } as unknown as BlobStore,
      pathBuilder: () => 'x.json',
    });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: { small: 'ok' } };
    await offloader.apply(payload);
    expect(put).not.toHaveBeenCalled();
    expect(payload['small']).toBe('ok');
    expect(payload['owox_payload_ref']).toBeUndefined();
  });

  it('degrades to inline when gcs sink lacks a pathBuilder', async () => {
    const put = jest.fn();
    const offloader = new PayloadOffloader({
      sink: 'gcs',
      inlineMaxBytes: 4096,
      blobStore: { put } as unknown as BlobStore,
      // no pathBuilder
    });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: { a: 1 } };
    await offloader.apply(payload);
    expect(put).not.toHaveBeenCalled();
    expect(payload['a']).toBe(1); // inlined
  });

  it('gcs: провал upload → owox_payload_error, не кидає', async () => {
    const store: BlobStore = {
      async put() {
        throw new Error('boom');
      },
    };
    const offloader = new PayloadOffloader({
      sink: 'gcs',
      inlineMaxBytes: 8,
      blobStore: store,
      pathBuilder: () => 'x.json',
    });
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: { big: 'x'.repeat(100) } };
    await expect(offloader.apply(payload)).resolves.toBeUndefined();
    expect(payload['owox_payload_error']).toBe(true);
    // Failure is diagnosable: size + reason are recorded, not a silent drop.
    expect(typeof payload['owox_payload_bytes']).toBe('number');
    expect(typeof payload['owox_payload_error_reason']).toBe('string');
  });

  it('non-serializable bulky (circular) → owox_payload_error, не кидає', async () => {
    const offloader = new PayloadOffloader({ sink: 'inline', inlineMaxBytes: 4096 });
    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;
    const payload: Record<string, unknown> = { [OFFLOAD_KEY]: circular };
    await expect(offloader.apply(payload)).resolves.toBeUndefined();
    expect(payload['owox_payload_error']).toBe(true);
    expect(payload[OFFLOAD_KEY]).toBeUndefined();
  });
});
