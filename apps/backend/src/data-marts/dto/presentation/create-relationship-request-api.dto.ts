import {
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  MinLength,
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

export class BlendedFieldApiDto {
  @ApiProperty({ example: 'revenue', description: 'Field name in the target data mart' })
  @IsString()
  @MinLength(1)
  targetFieldName: string;

  @ApiProperty({ example: 'total_revenue', description: 'Output alias for the blended field' })
  @IsString()
  @MinLength(1)
  outputAlias: string;

  @ApiProperty({ example: false, description: 'Whether the field is hidden in output' })
  @IsBoolean()
  @IsOptional()
  isHidden?: boolean;

  @ApiProperty({
    example: 'SUM',
    enum: ['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'],
    description: 'Aggregate function to apply to the field',
  })
  @IsEnum(['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'])
  @IsOptional()
  aggregateFunction?: 'STRING_AGG' | 'MAX' | 'MIN' | 'SUM' | 'COUNT' | 'ANY_VALUE';
}

export class CreateRelationshipRequestApiDto {
  @ApiProperty({
    example: '9cabc24e-1234-4a5a-8b12-abcdef123456',
    description: 'ID of the target data mart to blend with',
  })
  @IsString()
  targetDataMartId: string;

  @ApiProperty({ example: 'orders', description: 'Alias for the target data mart in the blend' })
  @IsString()
  @MinLength(1)
  targetAlias: string;

  @ApiProperty({
    type: [JoinConditionApiDto],
    description: 'Conditions used to join the data marts',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JoinConditionApiDto)
  joinConditions: JoinConditionApiDto[];

  @ApiProperty({
    type: [BlendedFieldApiDto],
    description: 'Fields to include from the target data mart',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BlendedFieldApiDto)
  blendedFields: BlendedFieldApiDto[];
}
