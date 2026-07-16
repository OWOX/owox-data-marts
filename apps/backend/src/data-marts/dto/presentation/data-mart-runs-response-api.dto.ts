import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunListItemResponseApiDto } from './data-mart-run-response-api.dto';

export class DataMartRunsResponseApiDto {
  @ApiProperty({ type: [DataMartRunListItemResponseApiDto] })
  runs: DataMartRunListItemResponseApiDto[];
}
