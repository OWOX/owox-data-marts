import { describe, it, expect } from 'vitest';
import { displayRecords, deriveColumns, testFailureMessage } from './ResultsDock';

describe('displayRecords', () => {
  it('returns the cast rows when present', () => {
    expect(
      displayRecords({ rows: [{ a: 1 }], logs: [], error: null, sample: [{ raw: true }] })
    ).toEqual([{ a: 1 }]);
  });
  it('falls back to the raw sample when there are no cast rows', () => {
    expect(displayRecords({ rows: [], logs: [], error: null, sample: [{ id: 1 }] })).toEqual([
      { id: 1 },
    ]);
  });
  it('returns [] when there are neither rows nor a sample', () => {
    expect(displayRecords({ rows: [], logs: [], error: null })).toEqual([]);
  });
});

describe('testFailureMessage', () => {
  it('shows the backend refusal instead of the axios status line', () => {
    // What the connector-test concurrency limit actually looks like to the dock.
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        data: {
          statusCode: 400,
          code: 'CONNECTOR_TEST_CONCURRENCY_LIMIT',
          message:
            'This project already has 3 connector tests running. Wait for one to finish, then try again.',
          errorDetails: { scope: 'project', limit: 3, retryAfterSeconds: 20 },
        },
      },
    });
    expect(testFailureMessage(axiosError)).toBe(
      'This project already has 3 connector tests running. Wait for one to finish, then try again.'
    );
  });

  it('falls back to the thrown message when the body carries none', () => {
    expect(testFailureMessage(new Error('Network Error'))).toBe('Network Error');
  });

  it('falls back to a generic sentence when there is nothing to show', () => {
    expect(testFailureMessage({})).toBe('Test failed');
    expect(testFailureMessage(new Error('   '))).toBe('Test failed');
  });
});

describe('deriveColumns', () => {
  it('unions top-level keys across object records', () => {
    expect(deriveColumns([{ a: 1 }, { b: 2, c: 3 }])).toEqual({
      columns: ['a', 'b', 'c'],
      primitive: false,
    });
  });
  it('uses a single "value" column for primitive records', () => {
    expect(deriveColumns(['x', 'y'] as unknown as Record<string, unknown>[])).toEqual({
      columns: ['value'],
      primitive: true,
    });
  });
});
