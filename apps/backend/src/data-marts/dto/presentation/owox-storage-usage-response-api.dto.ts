import { ApiProperty } from '@nestjs/swagger';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';

export class OwoxStorageTableApiDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty()
  rowCount: number;
}

export class OwoxStorageDeletionApiDto {
  @ApiProperty({ enum: ['NOT_PAID', 'INACTIVE'] })
  reason: 'NOT_PAID' | 'INACTIVE';

  @ApiProperty({ type: String, format: 'date-time' })
  date: Date;
}

export class OwoxStorageUsageResponseApiDto {
  @ApiProperty({ enum: ProjectPlanType })
  plan: ProjectPlanType;

  @ApiProperty()
  usedBytes: number;

  @ApiProperty({ description: 'The FREE limit, or the volume included in PAID.' })
  limitBytes: number;

  @ApiProperty({ type: [OwoxStorageTableApiDto] })
  tables: OwoxStorageTableApiDto[];

  @ApiProperty({ type: OwoxStorageDeletionApiDto, nullable: true })
  deletion: OwoxStorageDeletionApiDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt: Date | null;
}
