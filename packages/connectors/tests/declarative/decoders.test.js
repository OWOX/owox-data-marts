import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  decodeResponse,
  parseJsonl,
  parseCsv,
  MAX_RESPONSE_BYTES,
} from '../../src/Core/Declarative/decoders.js';

/** A minimal fake ReadableStream whose reader yields the given chunks then finishes. */
function fakeBodyStream(chunks) {
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i < chunks.length) return { done: false, value: chunks[i++] };
          return { done: true, value: undefined };
        },
        releaseLock() {},
      };
    },
  };
}

describe('decoders', () => {
  it('decodeResponse returns response.json() for json / absent format', async () => {
    const response = {
      async json() {
        return { a: 1 };
      },
      async text() {
        throw new Error('should not read text');
      },
    };
    assert.deepStrictEqual(await decodeResponse(response, 'json'), { a: 1 });
    assert.deepStrictEqual(await decodeResponse(response, undefined), { a: 1 });
  });

  it('decodeResponse rejects when content-length exceeds the cap, without reading the body', async () => {
    const response = {
      headers: { get: name => (name === 'content-length' ? String(MAX_RESPONSE_BYTES + 1) : null) },
      async json() {
        throw new Error('should not read body past the content-length cap');
      },
    };
    await assert.rejects(() => decodeResponse(response, 'json'), /response too large/i);
  });

  it('decodeResponse rejects a chunked (no content-length) body whose streamed bytes exceed the cap', async () => {
    const bigChunk = new Uint8Array(1024 * 1024); // 1 MiB per chunk
    const chunkCount = Math.ceil(MAX_RESPONSE_BYTES / bigChunk.length) + 2; // guarantees overflow
    const chunks = Array.from({ length: chunkCount }, () => bigChunk);
    const response = {
      headers: { get: () => null },
      body: fakeBodyStream(chunks),
      async json() {
        throw new Error('should not be called when body must be streamed');
      },
    };
    await assert.rejects(() => decodeResponse(response, 'json'), /response too large/i);
  });

  it('decodeResponse decodes a small chunked (no content-length) json body under the cap via streaming', async () => {
    const text = JSON.stringify({ a: 1 });
    const response = {
      headers: { get: () => null },
      body: fakeBodyStream([new TextEncoder().encode(text)]),
    };
    assert.deepStrictEqual(await decodeResponse(response, 'json'), { a: 1 });
  });

  it('decodeResponse concatenates streamed chunks without an extra full-body copy', async () => {
    // Chunks off a real fetch body are Uint8Array and go straight into
    // Buffer.concat; only a non-typed-array chunk needs converting. Both shapes
    // must decode, and a multi-chunk body must not be truncated or reordered.
    const enc = new TextEncoder();
    const asBytes = {
      headers: { get: () => null },
      body: fakeBodyStream([enc.encode('{"a":'), enc.encode('1,"b":'), enc.encode('"x"}')]),
    };
    assert.deepStrictEqual(await decodeResponse(asBytes, 'json'), { a: 1, b: 'x' });

    const asStrings = {
      headers: { get: () => null },
      body: fakeBodyStream(['{"a":', '2}']),
    };
    assert.deepStrictEqual(await decodeResponse(asStrings, 'json'), { a: 2 });
  });

  it('decodeResponse decodes multi-byte UTF-8 split across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode('{"n":"\u00e9\u4e2d"}');
    const chunks = [bytes.slice(0, 7), bytes.slice(7, 9), bytes.slice(9)];
    const response = { headers: { get: () => null }, body: fakeBodyStream(chunks) };
    assert.deepStrictEqual(await decodeResponse(response, 'json'), { n: '\u00e9\u4e2d' });
  });

  it('decodeResponse parses jsonl via response.text()', async () => {
    const response = {
      async text() {
        return '{"id":1}\n{"id":2}\n';
      },
    };
    assert.deepStrictEqual(await decodeResponse(response, 'jsonl'), [{ id: 1 }, { id: 2 }]);
  });

  it('decodeResponse parses csv via response.text()', async () => {
    const response = {
      async text() {
        return 'id,name\n1,Ann\n2,Bob\n';
      },
    };
    assert.deepStrictEqual(await decodeResponse(response, 'csv'), [
      { id: '1', name: 'Ann' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('decodeResponse throws on an unsupported format', async () => {
    await assert.rejects(
      () =>
        decodeResponse(
          {
            async text() {
              return '';
            },
          },
          'xml'
        ),
      /unsupported responseFormat "xml"/
    );
  });

  it('parseJsonl drops blank/whitespace lines', () => {
    assert.deepStrictEqual(parseJsonl('{"a":1}\n\n  \n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  });

  it('parseCsv keeps commas inside quoted fields', () => {
    assert.deepStrictEqual(parseCsv('id,name\n1,"Ann, Jr."\n'), [{ id: '1', name: 'Ann, Jr.' }]);
  });

  it('parseCsv unescapes doubled quotes inside quoted fields', () => {
    assert.deepStrictEqual(parseCsv('id,note\n1,"say ""hi"""\n'), [{ id: '1', note: 'say "hi"' }]);
  });

  it('parseCsv keeps newlines inside quoted fields', () => {
    assert.deepStrictEqual(parseCsv('id,note\n1,"line1\nline2"\n'), [
      { id: '1', note: 'line1\nline2' },
    ]);
  });

  it('parseCsv produces no trailing empty record for a trailing newline', () => {
    assert.strictEqual(parseCsv('id\n1\n2\n').length, 2);
  });

  it('parseCsv returns [] for empty input', () => {
    assert.deepStrictEqual(parseCsv(''), []);
  });
});
