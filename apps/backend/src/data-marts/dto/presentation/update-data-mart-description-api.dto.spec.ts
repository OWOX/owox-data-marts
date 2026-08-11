import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDataMartDescriptionApiDto } from './update-data-mart-description-api.dto';

/**
 * The ceiling is re-stated rather than imported: it is the `text` column's real capacity on
 * MySQL, not an incidental number, so these assertions have to fail when someone moves it.
 */
const MAX_TEXT_COLUMN_BYTES = 65535;

async function validateDto(payload: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateDataMartDescriptionApiDto, payload));
  return errors.map(error => error.property);
}

describe('UpdateDataMartDescriptionApiDto', () => {
  it('accepts an ordinary description', async () => {
    expect(await validateDto({ description: 'Daily spend by campaign.' })).toEqual([]);
  });

  it('accepts null, which clears the description', async () => {
    expect(await validateDto({ description: null })).toEqual([]);
  });

  it('rejects an empty description', async () => {
    expect(await validateDto({ description: '' })).toContain('description');
  });

  it('accepts a description exactly at the text column ceiling', async () => {
    expect(await validateDto({ description: 'a'.repeat(MAX_TEXT_COLUMN_BYTES) })).toEqual([]);
  });

  /**
   * `data_mart.description` is a `text` column. On MySQL -- the managed deployment's database
   * -- an over-long value is ER_DATA_TOO_LONG (a 500) in strict mode and a SILENT TRUNCATION
   * otherwise. Nothing catches it locally, because SQLite ignores declared column lengths.
   */
  it('rejects a description past the text column ceiling', async () => {
    expect(await validateDto({ description: 'a'.repeat(MAX_TEXT_COLUMN_BYTES + 1) })).toContain(
      'description'
    );
  });

  /**
   * The reason the limit is counted in BYTES. MySQL caps TEXT at 65535 bytes however many
   * characters that is, so a character count would wave this through at three times the
   * column's real capacity -- and the failure it buys is the 500, or the truncation.
   */
  it('rejects a multi-byte description that fits in characters but not in bytes', async () => {
    const threeBytesEach = '一'.repeat(Math.floor(MAX_TEXT_COLUMN_BYTES / 3) + 1);

    expect(threeBytesEach.length).toBeLessThan(MAX_TEXT_COLUMN_BYTES);
    expect(await validateDto({ description: threeBytesEach })).toContain('description');
  });
});
