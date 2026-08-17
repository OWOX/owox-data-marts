import {
  IsString,
  IsArray,
  ValidateNested,
  ValidateIf,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ALIAS_SEGMENT_ERROR, ALIAS_SEGMENT_REGEX } from '../schemas/blended-fields-config.schema';
import { JoinConditionApiDto } from './create-relationship-request-api.dto';

export class UpdateRelationshipRequestApiDto {
  @ApiProperty({
    example: 'orders',
    description: 'Alias for the target data mart in the blend',
    required: false,
    pattern: ALIAS_SEGMENT_REGEX.source,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(ALIAS_SEGMENT_REGEX, { message: `targetAlias ${ALIAS_SEGMENT_ERROR}` })
  @IsOptional()
  targetAlias?: string;

  @ApiProperty({
    type: [JoinConditionApiDto],
    description: 'Conditions used to join the data marts',
    required: false,
  })
  // Deliberately NOT @ArrayMinSize(1), matching the create endpoint: an empty array is a
  // supported DRAFT state (see join-condition.schema.spec). Requiring one here meant a draft
  // could be created but never returned to. A relationship with no conditions is refused where
  // it is USED — the blend builder names it and says what to fix — not where it is saved.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JoinConditionApiDto)
  @IsOptional()
  joinConditions?: JoinConditionApiDto[];

  @ApiProperty({
    example: 'Visitors from the website sign up for the product and convert into users',
    description:
      'Business meaning of this relationship, shared with AI assistants. Values are trimmed; send null or a blank (empty/whitespace-only) string to clear it.',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(obj => obj.description !== null)
  @IsString()
  description?: string | null;
}
