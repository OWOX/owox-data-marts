import { Writable } from 'node:stream';

import { buildTraverseDataOptions, streamDataMart } from './stream.js';

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
});
