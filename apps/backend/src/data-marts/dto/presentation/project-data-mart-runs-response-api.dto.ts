import { ApiProperty } from '@nestjs/swagger';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import {
  DataMartRunResponseApiDto,
  DataMartRunTotals,
  DataMartRunTotalsApiProperty,
} from './data-mart-run-response-api.dto';

export class ProjectDataMartRunRefResponseApiDto {
  @ApiProperty({
    example: 'a5c9b1d2-3456-7890-abcd-ef0123456789',
    description: 'Identifier of the Data Mart that produced the run.',
  })
  id: string;

  @ApiProperty({
    example: 'Marketing performance',
    description: 'Current title of the Data Mart that produced the run.',
  })
  title: string;
}

export class ProjectDataMartRunUserResponseApiDto extends UserProjectionDto {
  @ApiProperty({
    example: '44c7b3e4-5d6f-7a8b-9c0d-112233445566',
    description: 'Run author user identifier.',
  })
  declare readonly userId: string;

  @ApiProperty({
    type: String,
    example: 'Ada Lovelace',
    description: 'Run author full name when available.',
    required: false,
    nullable: true,
  })
  declare readonly fullName?: string | null;

  @ApiProperty({
    type: String,
    format: 'email',
    example: 'ada@example.com',
    description: 'Run author email address when available.',
    required: false,
    nullable: true,
  })
  declare readonly email?: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    example: 'https://example.com/avatar.png',
    description: 'Run author avatar URL when available.',
    required: false,
    nullable: true,
  })
  declare readonly avatar?: string | null;
}

export class ProjectDataMartRunResponseApiDto extends DataMartRunResponseApiDto {
  @DataMartRunTotalsApiProperty(true)
  declare totals: DataMartRunTotals;

  @ApiProperty({
    type: ProjectDataMartRunRefResponseApiDto,
    description: 'Data Mart reference for this project-wide run-history entry.',
  })
  dataMart: ProjectDataMartRunRefResponseApiDto;

  @ApiProperty({
    type: ProjectDataMartRunUserResponseApiDto,
    nullable: true,
    description:
      'Run author. Null when the run has no creator ID or the corresponding user projection is unavailable.',
  })
  createdByUser: ProjectDataMartRunUserResponseApiDto | null;
}

export class ProjectDataMartRunsResponseApiDto {
  @ApiProperty({
    type: [ProjectDataMartRunResponseApiDto],
    description: 'Newest-first page of project-visible Data Mart runs.',
  })
  runs: ProjectDataMartRunResponseApiDto[];
}
