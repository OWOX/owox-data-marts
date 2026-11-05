import { isDuckDbCredentials } from '../../data-storage-credentials.guards';

describe('isDuckDbCredentials', () => {
  it('accepts only credentials that carry the file path', () => {
    expect(isDuckDbCredentials({ databasePath: '/data/duckdb/s1.duckdb' })).toBe(true);
    expect(isDuckDbCredentials({})).toBe(false);
  });
});
