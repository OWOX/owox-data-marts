import {
  IsString,
  IsArray,
  IsNotEmpty,
  ValidateIf,
  ValidateNested,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ALIAS_SEGMENT_ERROR, ALIAS_SEGMENT_REGEX } from '../schemas/blended-fields-config.schema';

const TARGET_ALIAS_MESSAGE = `targetAlias ${ALIAS_SEGMENT_ERROR}`;

/**
 * A join key must be a TOP-LEVEL column. A dotted path (`address.city`) is rejected because the
 * blended query cannot express it: a joined Data Mart is collapsed to one row per join key by a
 * CTE that projects the key as `SELECT address.city … GROUP BY address.city`, which every engine
 * names after the LAST segment — so the CTE exposes `city`, while every reference to it is built
 * as `<cte>.address.city`. It never resolved; it was simply accepted and failed at the warehouse.
 */
const JOIN_FIELD_PATTERN = /^[^.]+$/;
const JOIN_FIELD_MESSAGE =
  'must be a top-level column name — a nested path (containing ".") cannot be used as a join key';

export class JoinConditionApiDto {
  @ApiProperty({ example: 'user_id', description: 'Field name in the source data mart' })
  @IsString()
  @MinLength(1)
  @Matches(JOIN_FIELD_PATTERN, { message: `sourceFieldName ${JOIN_FIELD_MESSAGE}` })
  sourceFieldName: string;

  @ApiProperty({ example: 'user_id', description: 'Field name in the target data mart' })
  @IsString()
  @MinLength(1)
  @Matches(JOIN_FIELD_PATTERN, { message: `targetFieldName ${JOIN_FIELD_MESSAGE}` })
  targetFieldName: string;
}

export class CreateRelationshipRequestApiDto {
  @ApiProperty({
    example: '9cabc24e-1234-4a5a-8b12-abcdef123456',
    description: 'ID of the target data mart to blend with',
  })
  @IsString()
  @IsNotEmpty()
  targetDataMartId: string;

  @ApiProperty({
    example: 'orders',
    description: 'Alias for the target data mart in the blend',
    pattern: ALIAS_SEGMENT_REGEX.source,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(ALIAS_SEGMENT_REGEX, { message: TARGET_ALIAS_MESSAGE })
  targetAlias: string;

  @ApiProperty({
    type: [JoinConditionApiDto],
    description: 'Conditions used to join the data marts',
  })
  // Deliberately NOT @ArrayMinSize(1): an empty array is a supported DRAFT state (see
  // join-condition.schema.spec). A draft relationship pulled into a blended query is caught at
  // build time instead, with a message naming it.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JoinConditionApiDto)
  joinConditions: JoinConditionApiDto[];

  @ApiProperty({
    example: 'Visitors from the website sign up for the product and convert into users',
    description: 'Business meaning of this relationship, shared with AI assistants',
    required: false,
  })
  // Not @IsOptional(): that would skip validation for an explicit null too, smuggling a null
  // into the `string | undefined` command field. Omitting the key is fine; null is a 400 —
  // unlike the update DTO, which deliberately opts INTO null as its "clear" signal.
  @ValidateIf(obj => obj.description !== undefined)
  @IsString()
  description?: string;
}
