import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunResponseApiDto } from './data-mart-run-response-api.dto';

export class DataMartRunsResponseApiDto {
  @ApiProperty({ type: [DataMartRunResponseApiDto] })
  runs: DataMartRunResponseApiDto[];
}
