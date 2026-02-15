import { ApiProperty } from '@nestjs/swagger';

export class PublishDataStorageDraftsResponseApiDto {
  @ApiProperty({ example: 0 })
  successCount: number;

  @ApiProperty({ example: 0 })
  failedCount: number;
}
