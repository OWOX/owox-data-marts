import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateDataMartOwnersApiDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  businessOwnerIds: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  technicalOwnerIds: string[];
}
