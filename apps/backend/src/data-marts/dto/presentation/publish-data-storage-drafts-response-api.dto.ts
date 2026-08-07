import { ApiProperty } from '@nestjs/swagger';

export class PublishDataStorageDraftsResponseApiDto {
  @ApiProperty({ example: 0 })
  successCount: number;

  @ApiProperty({ example: 0 })
  failedCount: number;

  @ApiProperty({ example: null, required: false })
  error?: string;

  /**
   * Distinct reasons the failed drafts could not be published. Deliberately
   * carries no Data Mart ids or titles: EDIT on the storage does not imply
   * visibility of every Data Mart inside it.
   */
  @ApiProperty({
    type: [String],
    required: false,
    example: ['Data Mart has no definition'],
  })
  failureReasons?: string[];
}
