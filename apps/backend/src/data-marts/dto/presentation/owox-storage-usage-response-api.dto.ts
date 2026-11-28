import { ApiProperty } from '@nestjs/swagger';

export class OwoxStorageTableApiDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty()
  rowCount: number;
}

export class OwoxStorageUsageResponseApiDto {
  @ApiProperty()
  usedBytes: number;

  @ApiProperty({ description: 'The size limit of the storage.' })
  limitBytes: number;

  @ApiProperty({ type: [OwoxStorageTableApiDto] })
  tables: OwoxStorageTableApiDto[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt: Date | null;
}
