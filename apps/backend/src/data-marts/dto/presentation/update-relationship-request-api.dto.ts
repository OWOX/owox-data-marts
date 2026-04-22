import {
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ALIAS_SEGMENT_ERROR, ALIAS_SEGMENT_REGEX } from '../schemas/blended-fields-config.schemas';
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
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JoinConditionApiDto)
  @IsOptional()
  joinConditions?: JoinConditionApiDto[];
}
