import { ApiProperty } from '@nestjs/swagger';
import { BatchDataMartHealthStatusItemApiDto } from './batch-data-mart-health-status-item-api.dto';

export class BatchDataMartHealthStatusResponseApiDto {
  @ApiProperty({ type: [BatchDataMartHealthStatusItemApiDto] })
  items: BatchDataMartHealthStatusItemApiDto[];
}
