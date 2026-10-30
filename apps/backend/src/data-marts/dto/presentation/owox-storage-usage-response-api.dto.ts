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

export class OwoxStorageUsageResponseApiDto {
  @ApiProperty({ enum: ProjectPlanType })
  plan: ProjectPlanType;

  @ApiProperty()
  usedBytes: number;

  @ApiProperty({ description: 'The FREE limit, or the volume included in PAID.' })
  limitBytes: number;

  @ApiProperty({ type: [OwoxStorageTableApiDto] })
  tables: OwoxStorageTableApiDto[];
}
