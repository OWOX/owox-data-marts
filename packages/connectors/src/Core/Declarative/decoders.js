/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Hard cap on a declarative response body, in bytes. Guards against a hostile
 * or misbehaving upstream sending an unbounded body that would otherwise be
 * buffered whole into memory (response.json()/text()) and OOM the process.
 * Overridable per call via decodeResponse's `maxBytes` option.
 */
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024; // 64 MiB

/**
 * Decodes a fetch Response body into a value RecordSelector can extract from,
 * per the node's recordSelector.responseFormat. Declarative-only (used by the
 * Requester); the shared engine and bundled connectors are unaffected. No
 * external dependency.
 *
 * - json (or absent) -> response.json() (object/array)
 * - jsonl            -> array of objects, one per non-empty line
 * - csv              -> array of objects keyed by the header row (RFC-4180:
 *                       quoted fields, "" escaped quotes, commas/newlines in quotes)
 * CSV/JSONL yield arrays, so the node uses recordPath: []. Field values are
 * strings; FieldCaster casts them per the declared field type.
 *
 * Size cap: if `content-length` is present and exceeds maxBytes, rejects
 * without reading the body. Otherwise (chunked / unknown length) the body is
 * read via its stream, counting bytes, and aborted past maxBytes before any
 * buffering — so a real fetch Response never gets fully materialized in
 * memory when it's oversized. Fakes without a readable `.body` stream (as
 * used by unit tests) fall back to the original response.json()/text() call,
 * unaffected when under the cap.
 */
export async function decodeResponse(response, format, { maxBytes = MAX_RESPONSE_BYTES } = {}) {
  assertContentLengthWithinCap(response, maxBytes);
  const text = await readCappedText(response, format, maxBytes);
  if (text !== undefined) {
    if (format === 'jsonl') return parseJsonl(text);
    if (format === 'csv') return parseCsv(text);
    if (!format || format === 'json') return JSON.parse(text);
    throw new Error(`decodeResponse: unsupported responseFormat "${format}"`);
  }

  if (!format || format === 'json') return response.json();
  if (format === 'jsonl') return parseJsonl(await response.text());
  if (format === 'csv') return parseCsv(await response.text());
  throw new Error(`decodeResponse: unsupported responseFormat "${format}"`);
}

function assertContentLengthWithinCap(response, maxBytes) {
  const raw = response?.headers?.get?.('content-length');
  if (raw == null) return;
  const declared = Number(raw);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(
      `decodeResponse: response too large (content-length ${declared} exceeds ${maxBytes} bytes)`
    );
  }
}

/**
 * Reads response.body via its stream, counting bytes and throwing once the
 * accumulated size exceeds maxBytes (before the whole body is buffered).
 * Returns the decoded text, or `undefined` if the response has no readable
 * stream body (caller falls back to response.json()/text()).
 */
async function readCappedText(response, format, maxBytes) {
  const stream = response?.body;
  if (!stream || typeof stream.getReader !== 'function') return undefined;

  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength ?? value.length ?? 0;
        if (total > maxBytes) {
          throw new Error(`decodeResponse: response too large (exceeds ${maxBytes} bytes)`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
}

export function parseJsonl(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
}

export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map(cells => {
    const record = {};
    header.forEach((name, i) => {
      record[name] = cells[i] ?? '';
    });
    return record;
  });
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore (handles \r\n line endings)
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
