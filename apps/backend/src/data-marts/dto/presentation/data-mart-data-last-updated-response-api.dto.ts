import { ApiProperty } from '@nestjs/swagger';
import { SourceDataLastUpdatedCoverage } from '../schemas/source-data-last-updated.schema';

export class DataMartDataLastUpdatedSourceApiDto {
  @ApiProperty({ example: 'my-project.sales.orders' })
  table: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-07-25T08:30:00.000Z' })
  dataLastUpdatedAt: string | null;

  @ApiProperty({ required: false, example: 'sharded table set — newest shard' })
  note?: string;
}

/**
 * List-shaped view: what a row or canvas badge renders, without the per-table detail.
 *
 * Lists page up to a thousand Data Marts and each block can carry ~50 source entries, so the
 * full block per row would add megabytes to one response for detail these surfaces never show.
 */
export class DataMartDataLastUpdatedSummaryApiDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-07-25T08:30:00.000Z',
    description:
      'When the newest source table last changed in the warehouse. This is a storage-level write time, not the period the data covers; null means unknown.',
  })
  dataLastUpdatedAt: string | null;

  @ApiProperty({ example: '2026-07-28T10:00:00.000Z' })
  computedAt: string;

  @ApiProperty({ enum: SourceDataLastUpdatedCoverage, example: 'complete' })
  coverage: (typeof SourceDataLastUpdatedCoverage)[number];
}

export class DataMartDataLastUpdatedResponseApiDto extends DataMartDataLastUpdatedSummaryApiDto {
  @ApiProperty({ type: [DataMartDataLastUpdatedSourceApiDto] })
  sources: DataMartDataLastUpdatedSourceApiDto[];
}

export class DataMartDataLastUpdatedItemApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  dataMartId: string;

  @ApiProperty({ type: DataMartDataLastUpdatedResponseApiDto })
  dataLastUpdated: DataMartDataLastUpdatedResponseApiDto;
}

export class BatchDataMartDataLastUpdatedResponseApiDto {
  @ApiProperty({
    type: [DataMartDataLastUpdatedItemApiDto],
    description:
      'One entry per Data Mart that was measured. Requested ids may be absent when the lookup was cut short or the Data Mart is not visible — treat a missing id as "no new information", not as a reset.',
  })
  items: DataMartDataLastUpdatedItemApiDto[];
}
