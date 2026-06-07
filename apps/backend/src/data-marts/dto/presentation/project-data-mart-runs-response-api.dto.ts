import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunResponseApiDto } from './data-mart-run-response-api.dto';

export class ProjectDataMartRunRefResponseApiDto {
  @ApiProperty({ example: 'a5c9b1d2-3456-7890-abcd-ef0123456789' })
  id: string;

  @ApiProperty({ example: 'Marketing performance' })
  title: string;
}

export class ProjectDataMartRunResponseApiDto extends DataMartRunResponseApiDto {
  @ApiProperty({ type: ProjectDataMartRunRefResponseApiDto })
  dataMart: ProjectDataMartRunRefResponseApiDto;
}

export class ProjectDataMartRunsResponseApiDto {
  @ApiProperty({ type: [ProjectDataMartRunResponseApiDto] })
  runs: ProjectDataMartRunResponseApiDto[];
}
