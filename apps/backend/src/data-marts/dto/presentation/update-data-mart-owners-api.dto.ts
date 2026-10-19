import { IsInt, Min, IsOptional as RevisionOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class UpdateDataMartOwnersApiDto {
  @ApiProperty({ required: false, minimum: 1 })
  @RevisionOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  businessOwnerIds: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  technicalOwnerIds: string[];
}
