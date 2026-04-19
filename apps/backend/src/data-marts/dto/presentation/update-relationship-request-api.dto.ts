import {
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  MinLength,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { JoinConditionApiDto } from './create-relationship-request-api.dto';

export class UpdateRelationshipRequestApiDto {
  @ApiProperty({
    example: 'orders',
    description: 'Alias for the target data mart in the blend',
    required: false,
  })
  @IsString()
  @MinLength(1)
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
