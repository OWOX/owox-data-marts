import { IsString, IsArray, ValidateNested, MinLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ALIAS_SEGMENT_ERROR, ALIAS_SEGMENT_REGEX } from '../schemas/blended-fields-config.schemas';

const TARGET_ALIAS_MESSAGE = `targetAlias ${ALIAS_SEGMENT_ERROR}`;

export class JoinConditionApiDto {
  @ApiProperty({ example: 'user_id', description: 'Field name in the source data mart' })
  @IsString()
  @MinLength(1)
  sourceFieldName: string;

  @ApiProperty({ example: 'user_id', description: 'Field name in the target data mart' })
  @IsString()
  @MinLength(1)
  targetFieldName: string;
}

export class CreateRelationshipRequestApiDto {
  @ApiProperty({
    example: '9cabc24e-1234-4a5a-8b12-abcdef123456',
    description: 'ID of the target data mart to blend with',
  })
  @IsString()
  targetDataMartId: string;

  @ApiProperty({
    example: 'orders',
    description: 'Alias for the target data mart in the blend',
    pattern: ALIAS_SEGMENT_REGEX.source,
  })
  @IsString()
  @MinLength(1)
  @Matches(ALIAS_SEGMENT_REGEX, { message: TARGET_ALIAS_MESSAGE })
  targetAlias: string;

  @ApiProperty({
    type: [JoinConditionApiDto],
    description: 'Conditions used to join the data marts',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JoinConditionApiDto)
  joinConditions: JoinConditionApiDto[];
}
