import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunResponseApiDto } from './data-mart-run-response-api.dto';

export class BatchDataMartHealthStatusItemApiDto {
  @ApiProperty()
  dataMartId: string;

  @ApiProperty({ required: false, nullable: true })
  connector: DataMartRunResponseApiDto | null;

  @ApiProperty({ required: false, nullable: true })
  report: DataMartRunResponseApiDto | null;

  @ApiProperty({ required: false, nullable: true })
  insight: DataMartRunResponseApiDto | null;
}
