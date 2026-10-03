import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SqlDryRunRequestApiDto } from './sql-dry-run-request-api.dto';

/**
 * The ceiling is re-stated rather than imported: it is the `mediumtext` column's real capacity
 * on MySQL, not an incidental number, so these assertions have to fail when someone moves it.
 */
const MAX_MEDIUMTEXT_COLUMN_BYTES = 16777215;

async function validateDto(payload: Record<string, unknown>) {
  const errors = await validate(plainToInstance(SqlDryRunRequestApiDto, payload));
  return errors.map(error => error.property);
}

describe('SqlDryRunRequestApiDto', () => {
  it('accepts an ordinary query', async () => {
    expect(await validateDto({ sql: 'SELECT 1' })).toEqual([]);
  });

  it('rejects an empty query', async () => {
    expect(await validateDto({ sql: '' })).toContain('sql');
  });

  it('rejects a missing query', async () => {
    expect(await validateDto({})).toContain('sql');
  });

  it('accepts a query exactly at the mediumtext column ceiling', async () => {
    expect(await validateDto({ sql: 'a'.repeat(MAX_MEDIUMTEXT_COLUMN_BYTES) })).toEqual([]);
  });

  /**
   * `sql_dry_run_triggers.sql` is `mediumtext` on MySQL -- the managed deployment's database.
   * An over-long value is ER_DATA_TOO_LONG (a 500) in strict mode and a SILENT TRUNCATION
   * otherwise. Nothing catches it locally, because SQLite ignores declared column lengths.
   */
  it('rejects a query past the mediumtext column ceiling', async () => {
    expect(await validateDto({ sql: 'a'.repeat(MAX_MEDIUMTEXT_COLUMN_BYTES + 1) })).toContain(
      'sql'
    );
  });

  /**
   * The reason the limit is counted in BYTES. MySQL caps MEDIUMTEXT at 16777215 bytes however
   * many characters that is, so a character count would wave this through at three times the
   * column's real capacity -- and the failure it buys is the 500, or the truncation.
   */
  it('rejects a multi-byte query that fits in characters but not in bytes', async () => {
    const threeBytesEach = '一'.repeat(Math.floor(MAX_MEDIUMTEXT_COLUMN_BYTES / 3) + 1);

    expect(threeBytesEach.length).toBeLessThan(MAX_MEDIUMTEXT_COLUMN_BYTES);
    expect(await validateDto({ sql: threeBytesEach })).toContain('sql');
  });
});
