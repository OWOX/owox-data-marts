import { BatchDataMartHealthStatusItemDto } from './batch-data-mart-health-status-item.dto';

export class BatchDataMartHealthStatusResponseDto {
  constructor(public readonly items: BatchDataMartHealthStatusItemDto[]) {}
}
