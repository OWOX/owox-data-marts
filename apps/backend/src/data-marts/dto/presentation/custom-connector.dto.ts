import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MaxByteLength } from '../../../common/validators/max-byte-length.validator';
import { MaxJsonSize } from '../../../common/validators/max-json-size.validator';

/**
 * Ceiling for a user-authored manifest.
 *
 * The binding constraint is the spawn, not storage. A stored manifest is handed to the connector
 * child process through the OW_MANIFEST environment variable (ConnectorProcessSpawnerService's
 * buildChildEnv and ConnectorTestService.runTest both JSON.stringify it), and Linux -- the
 * deployment target -- refuses a single env string longer than MAX_ARG_STRLEN, 32 * PAGE_SIZE =
 * 131072 bytes, measured across the whole `OW_MANIFEST=<json>` string plus its terminator. Past
 * that, every run of the connector dies at spawn with an opaque E2BIG, by which point it is
 * published and bound to a Data Mart. Bounding it here turns that into an actionable 400 while the
 * author is still writing the thing.
 *
 * 120 KiB keeps 8 KiB under the kernel ceiling, covering the variable name, the terminator, and the
 * separate total argv+envp budget that OW_CONFIG and OW_RUN_CONFIG share on the same spawn. It
 * refuses nothing realistic: the largest declarative manifest in this repo is 675 bytes, and the
 * most field-heavy node of any bundled connector (CriteoAds ad statistics, 156 fields) renders to
 * ~24 KiB with full descriptions -- so five nodes of that weight still fit.
 *
 * Exported because this DTO is not the only way in: the MCP tools (connector-publish,
 * connector-test) accept a manifest through their own Zod schemas and never reach here.
 * ConnectorDefinitionService enforces the same ceiling on create()/saveDraft(), which is what
 * every path shares -- see assertManifestFitsSpawn() there.
 */
export const MAX_MANIFEST_SIZE_BYTES = 120 * 1024;

/**
 * Ceilings for the rest of the create body, each keyed to the column the value lands in.
 *
 * The migration declares `name`, `title` and `docUrl` as `varchar` -- TypeORM's default length,
 * 255 -- and `description` and `logo` as `text`. On MySQL, the managed deployment's database, an
 * over-long value is ER_DATA_TOO_LONG (a 500) in strict mode and a SILENT TRUNCATION otherwise: a
 * clipped title, or a base64 logo cut mid-string and no longer an image. Nothing catches it
 * locally, because DbType is `sqlite | mysql` and SQLite ignores declared column lengths outright.
 *
 * The unit follows the column, and the two differ: MySQL counts VARCHAR(n) in CHARACTERS, which is
 * what `@MaxLength` measures, but caps TEXT at 65535 BYTES regardless of how many characters that
 * is -- so the text-backed fields need `@MaxByteLength`, or a description of multi-byte characters
 * would pass validation at up to three times the column's real capacity.
 *
 * The logo has a second reason to be bounded, which is why 64 KiB of base64 (comfortably a 256x256
 * icon) is a ceiling worth keeping rather than a formality: the list endpoint returns it inline for
 * every definition in the project, so an unbounded one is amplified across the whole list rather
 * than costing only its own record.
 */
const MAX_VARCHAR_LENGTH = 255;
const MAX_TEXT_COLUMN_BYTES = 65535;

export class CreateCustomConnectorRequestApiDto {
  @ApiProperty({ example: 'MyCustomApi', maxLength: MAX_VARCHAR_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARCHAR_LENGTH)
  name: string;

  @ApiProperty({ example: 'My Custom API', maxLength: MAX_VARCHAR_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARCHAR_LENGTH)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxByteLength(MAX_TEXT_COLUMN_BYTES)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxByteLength(MAX_TEXT_COLUMN_BYTES)
  logo?: string;

  @ApiProperty({ required: false, maxLength: MAX_VARCHAR_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_VARCHAR_LENGTH)
  docUrl?: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @MaxJsonSize(MAX_MANIFEST_SIZE_BYTES)
  manifest: Record<string, unknown>;
}

export class SaveDraftRequestApiDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @MaxJsonSize(MAX_MANIFEST_SIZE_BYTES)
  manifest: Record<string, unknown>;
}

export class TestConnectorRequestApiDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsNotEmpty()
  @MaxJsonSize(MAX_MANIFEST_SIZE_BYTES)
  manifest: Record<string, unknown>;

  @ApiProperty({ example: 'items' })
  @IsString()
  @IsNotEmpty()
  node: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  configuration: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxRows?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxPages?: number;
}
