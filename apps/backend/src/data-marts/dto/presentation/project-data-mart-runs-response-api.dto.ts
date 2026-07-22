import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunResponseApiDto } from './data-mart-run-response-api.dto';

export class ProjectDataMartRunRefResponseApiDto {
  @ApiProperty({ example: 'a5c9b1d2-3456-7890-abcd-ef0123456789' })
  id: string;

  @ApiProperty({ example: 'Marketing performance' })
  title: string;
}

export class ProjectDataMartRunUserResponseApiDto {
  @ApiProperty({ example: '44c7b3e4-5d6f-7a8b-9c0d-112233445566' })
  userId: string;

  @ApiProperty({ type: String, example: 'Ada Lovelace', required: false, nullable: true })
  fullName?: string | null;

  @ApiProperty({ type: String, example: 'ada@example.com', required: false, nullable: true })
  email?: string | null;

  @ApiProperty({
    type: String,
    example: 'https://example.com/avatar.png',
    required: false,
    nullable: true,
  })
  avatar?: string | null;
}

export class ProjectDataMartRunResponseApiDto extends DataMartRunResponseApiDto {
  @ApiProperty({ type: ProjectDataMartRunRefResponseApiDto })
  dataMart: ProjectDataMartRunRefResponseApiDto;

  @ApiProperty({ type: ProjectDataMartRunUserResponseApiDto, nullable: true })
  createdByUser: ProjectDataMartRunUserResponseApiDto | null;
}

export class ProjectDataMartRunsResponseApiDto {
  @ApiProperty({ type: [ProjectDataMartRunResponseApiDto] })
  runs: ProjectDataMartRunResponseApiDto[];
}
