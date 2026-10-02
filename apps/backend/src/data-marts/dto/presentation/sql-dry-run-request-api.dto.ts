import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { MaxByteLength } from '../../../common/validators/max-byte-length.validator';

/**
 * The `sql_dry_run_triggers.sql` column is `mediumtext` on MySQL -- the managed deployment's
 * database -- which holds 16777215 BYTES. An over-long value is ER_DATA_TOO_LONG (a 500) in
 * strict mode and a SILENT TRUNCATION otherwise. Nothing catches it locally, because SQLite
 * ignores declared column lengths outright.
 *
 * Counted in bytes, not characters: `@MaxLength` would accept multi-byte SQL at up to four
 * times the column's real capacity.
 */
const MAX_MEDIUMTEXT_COLUMN_BYTES = 16777215;

export class SqlDryRunRequestApiDto {
  @ApiProperty({
    description: 'SQL query to validate',
    example: 'SELECT * FROM table_name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxByteLength(MAX_MEDIUMTEXT_COLUMN_BYTES)
  sql: string;
}
