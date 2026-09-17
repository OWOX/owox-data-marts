import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { MaxByteLength } from '../../../common/validators/max-byte-length.validator';

/**
 * The `data_mart.description` column is `text`. On MySQL -- the managed deployment's database
 * -- that holds 65535 BYTES, and an over-long value is ER_DATA_TOO_LONG (a 500) in strict mode
 * and a SILENT TRUNCATION otherwise. Nothing catches it locally, because DbType is
 * `sqlite | mysql` and SQLite ignores declared column lengths outright.
 *
 * Counted in bytes, not characters: MySQL caps TEXT at 65535 bytes however many characters
 * that is, so `@MaxLength` here would accept a description of multi-byte characters at up to
 * three times the column's real capacity.
 */
const MAX_TEXT_COLUMN_BYTES = 65535;

export class UpdateDataMartDescriptionApiDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf(obj => obj.description !== null)
  @IsString()
  @MinLength(1)
  @MaxByteLength(MAX_TEXT_COLUMN_BYTES)
  description: string;
}
