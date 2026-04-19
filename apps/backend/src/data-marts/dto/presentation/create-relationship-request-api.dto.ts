import { IsString, IsArray, ValidateNested, MinLength } from 'class-validator';
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
  @ValidateNested({ each: true })
  @Type(() => JoinConditionApiDto)
  joinConditions: JoinConditionApiDto[];
}
