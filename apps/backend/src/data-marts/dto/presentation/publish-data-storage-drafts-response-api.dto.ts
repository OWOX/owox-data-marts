import { ApiProperty } from '@nestjs/swagger';

export class PublishDraftFailureApiDto {
  @ApiProperty()
  dataMartId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  error: string;
}

export class PublishDataStorageDraftsResponseApiDto {
  @ApiProperty({ example: 0 })
  successCount: number;

  @ApiProperty({ example: 0 })
  failedCount: number;

  @ApiProperty({ example: null, required: false })
  error?: string;

  @ApiProperty({ type: [PublishDraftFailureApiDto], required: false })
  failures?: PublishDraftFailureApiDto[];
}
