import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class RefreshDataMartDataLastUpdatedRequestApiDto {
  @ApiProperty({
    type: [String],
    description:
      'Data Marts to measure. All are looked up together, so ids sharing a storage pay for that storage’s warehouse client only once.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  ids: string[];
}
