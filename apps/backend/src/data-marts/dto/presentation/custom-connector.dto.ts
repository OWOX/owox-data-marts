import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MaxCodePointLength } from '../../../common/validators/max-code-point-length.validator';
import { MaxByteLength } from '../../../common/validators/max-byte-length.validator';
import { MaxJsonSize } from '../../../common/validators/max-json-size.validator';

import {
  MAX_MANIFEST_SIZE_BYTES,
  MAX_TEXT_COLUMN_BYTES,
  MAX_VARCHAR_LENGTH,
} from '../../connector-types/custom-connector-limits';

export class CreateCustomConnectorRequestApiDto {
  @ApiProperty({ example: 'MyCustomApi', maxLength: MAX_VARCHAR_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxCodePointLength(MAX_VARCHAR_LENGTH)
  name: string;

  @ApiProperty({ example: 'My Custom API', maxLength: MAX_VARCHAR_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxCodePointLength(MAX_VARCHAR_LENGTH)
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
  @MaxCodePointLength(MAX_VARCHAR_LENGTH)
  docUrl?: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @MaxJsonSize(MAX_MANIFEST_SIZE_BYTES)
  manifest: Record<string, unknown>;
}

/**
 * The connector's display metadata, editable after creation.
 *
 * `name` is deliberately absent and cannot be added here. A data mart stores the connector it
 * runs as a bare string in `connector.source.name` -- the same field a bundled connector fills,
 * which is why it is a name and not this row's id: bundled connectors have no id. Renaming a
 * definition would strand every data mart pointing at the old name with no error at either end.
 *
 * Every field is optional, and the three nullable ones accept an explicit null to clear them:
 * absent means "leave alone", which is what makes this a PATCH rather than a PUT.
 */
export class UpdateCustomConnectorRequestApiDto {
  // Not @IsOptional, which lets null through as well: the title column is NOT NULL, so only an
  // absent title may skip validation.
  @ApiProperty({ required: false, example: 'My Custom API', maxLength: MAX_VARCHAR_LENGTH })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxCodePointLength(MAX_VARCHAR_LENGTH)
  title?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxByteLength(MAX_TEXT_COLUMN_BYTES)
  description?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxByteLength(MAX_TEXT_COLUMN_BYTES)
  logo?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, maxLength: MAX_VARCHAR_LENGTH })
  @IsOptional()
  @IsString()
  @MaxCodePointLength(MAX_VARCHAR_LENGTH)
  docUrl?: string | null;
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

  /**
   * Bounded for the same reason the manifest is: it travels to the connector runner in
   * OW_CONFIG, a sibling environment string on the same spawn, and an unbounded one dies
   * with the same E2BIG. ConnectorTestService.runTest() applies the ceiling too -- this is
   * here so the refusal arrives as a field-level 400 alongside the rest of the body's
   * errors, rather than as a bare message from the service.
   */
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @MaxJsonSize(MAX_MANIFEST_SIZE_BYTES)
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
