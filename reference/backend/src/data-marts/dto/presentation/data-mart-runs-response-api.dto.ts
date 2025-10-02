import { ApiProperty } from '@nestjs/swagger';
import { DataMartRun } from '../schemas/data-mart-run/data-mart-run.schema';

export class DataMartRunsResponseApiDto {
  @ApiProperty()
  runs: DataMartRun[];
}
