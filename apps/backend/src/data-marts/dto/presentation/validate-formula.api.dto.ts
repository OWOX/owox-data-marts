import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CALCULATED_FORMULA_MAX_LENGTH } from '../../data-storage-types/data-mart-schema.utils';
import { FormulaViolationApiDto } from './update-data-mart-schema-api.dto';

/**
 * At most this many formulas may travel with one check. The ceiling exists to bound the request,
 * not to describe a schema: at `CALCULATED_FORMULA_MAX_LENGTH` each, this stays inside the 2 MB
 * transport limit `body-parser.config.ts` keeps above every endpoint's own bound, so a caller past
 * it gets this endpoint's documented 400 rather than a middleware failure.
 */
const MAX_DRAFT_CALCULATED_FIELDS = 100;

export class DraftCalculatedFieldApiDto {
  @ApiProperty({ example: 'revenue', description: 'The name this formula is held under.' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'FLOAT', description: "The field's output type." })
  @IsString()
  @MinLength(1)
  type: string;

  @ApiProperty({
    example: 'SUM({{ref field="amount"}})',
    description: 'The formula in its STORED form, as the schema save would carry it.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(CALCULATED_FORMULA_MAX_LENGTH)
  formula: string;
}

export class ValidateFormulaApiDto {
  @ApiProperty({
    example: 'ctr',
    description:
      'Name the calculated field will be saved under. A field of this name in the current schema ' +
      'is replaced by this formula for the check, so a reference resolves as it will at save.',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 'FLOAT',
    description: "The field's output type, in the storage's own vocabulary.",
  })
  @IsString()
  @MinLength(1)
  type: string;

  @ApiProperty({
    example: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
    description:
      'The formula in its STORED form — dialect SQL carrying {{ref}} tags, the same shape the ' +
      'schema save carries.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(CALCULATED_FORMULA_MAX_LENGTH)
  formula: string;

  @ApiPropertyOptional({
    type: [DraftCalculatedFieldApiDto],
    description:
      "Every calculated field the caller's schema editor is holding, saved or not. The Output " +
      'Schema editor defers its save, so a formula can name a sibling that exists nowhere on ' +
      'disk yet; sent here, those formulas REPLACE the persisted ones for this check, so a ' +
      'sibling added in the session resolves and one deleted in it stops being judged. Omit it ' +
      '(or send an empty list) and the check falls back to the persisted schema.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DRAFT_CALCULATED_FIELDS)
  @ValidateNested({ each: true })
  @Type(() => DraftCalculatedFieldApiDto)
  calculatedFields?: DraftCalculatedFieldApiDto[];
}

export class ValidateFormulaResponseApiDto {
  @ApiProperty({
    type: [FormulaViolationApiDto],
    description: 'Violations of the submitted formula itself — all of them, for this field only.',
  })
  errors: FormulaViolationApiDto[];

  @ApiProperty({
    type: [FormulaViolationApiDto],
    description: 'Non-blocking advisories about the submitted formula, e.g. an unguarded division.',
  })
  warnings: FormulaViolationApiDto[];

  @ApiProperty({
    type: [FormulaViolationApiDto],
    description:
      'What saving this formula would break elsewhere in the schema, each violation named under ' +
      'the field that owns the broken formula — e.g. turning a column into a calculated field ' +
      'makes every other formula referencing that column illegal. The save refuses on these; they are reported ' +
      'here so the editor can say so before the analyst presses Save.',
  })
  otherFieldErrors: FormulaViolationApiDto[];
}
