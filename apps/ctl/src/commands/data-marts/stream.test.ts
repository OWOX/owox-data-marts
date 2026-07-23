import { Writable } from 'node:stream';

import DataMartsStream, { buildTraverseDataOptions, streamDataMart } from './stream.js';

function writableCollector() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  return { stream, chunks };
}

describe('data-marts stream', () => {
  it('rejects limits below the HTTP Data contract minimum', () => {
    expect(DataMartsStream.flags.limit.min).toBe(1);
  });

  it('writes each streamed row chunk to stdout as NDJSON without buffering the whole result', async () => {
    const receivedOptions: unknown[] = [];
    const { stream, chunks } = writableCollector();

    await streamDataMart(
      {
        dataMarts: {
          traverseData: async (_dataMartId, options) => {
            receivedOptions.push(options);
            return {
              runId: 'run-1',
              async *rowChunks() {
                yield [{ date: '2026-05-01' }, { date: '2026-05-02' }];
                yield [{ date: '2026-05-02' }];
              },
            };
          },
        },
      },
      'dm-1',
      {
        columns: '*',
        column: ['Event Date (local)', '*'],
        limit: 1000,
      },
      stream
    );

    expect(chunks).toEqual([
      '{"date":"2026-05-01"}\n{"date":"2026-05-02"}\n',
      '{"date":"2026-05-02"}\n',
    ]);
    expect(receivedOptions).toEqual([
      {
        columns: '*',
        column: ['Event Date (local)', '*'],
        limit: 1000,
      },
    ]);
  });

  it('parses filter and sort flags as JSON arrays for traversal options', () => {
    expect(
      buildTraverseDataOptions({
        columns: '*',
        column: ['Event Date (local)'],
        filter: '[{"column":"Event Date (local)","operator":"gte","value":"2026-01-01"}]',
        sort: '[{"column":"Event Date (local)","direction":"desc"}]',
        limit: 1000,
      })
    ).toEqual({
      columns: '*',
      column: ['Event Date (local)'],
      filter: [{ column: 'Event Date (local)', operator: 'gte', value: '2026-01-01' }],
      sort: [{ column: 'Event Date (local)', direction: 'desc' }],
      limit: 1000,
    });
  });

  it('rejects malformed filter and sort JSON flags before opening the stream', () => {
    expect(() => buildTraverseDataOptions({ filter: '{"column":"date"}' })).toThrow(
      '--filter must be a JSON array'
    );
    expect(() => buildTraverseDataOptions({ sort: 'not-json' })).toThrow(
      '--sort must be valid JSON'
    );
  });

  it('parses aggregation and date-bucket flags as JSON arrays for traversal options', () => {
    expect(
      buildTraverseDataOptions({
        columns: '*',
        column: ['revenue'],
        aggregation: '[{"column":"revenue","function":"SUM"}]',
        'date-bucket': '[{"column":"date","unit":"MONTH"}]',
        limit: 1000,
      })
    ).toEqual({
      columns: '*',
      column: ['revenue'],
      filter: undefined,
      sort: undefined,
      aggregation: [{ column: 'revenue', function: 'SUM' }],
      dateTrunc: [{ column: 'date', unit: 'MONTH' }],
      limit: 1000,
    });
  });

  it('rejects malformed aggregation and date-bucket JSON flags before opening the stream', () => {
    expect(() => buildTraverseDataOptions({ aggregation: '{"column":"revenue"}' })).toThrow(
      '--aggregation must be a JSON array'
    );
    expect(() => buildTraverseDataOptions({ 'date-bucket': 'not-json' })).toThrow(
      '--date-bucket must be valid JSON'
    );
  });
});
