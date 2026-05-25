import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProjectRole } from '../../enums/project-role.enum';

export class RequestAccessUserApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;
}

export class RequestAccessOrganizationApiDto {
  @ApiProperty()
  name: string;
}

export class RequestAccessProjectApiDto {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectTitle: string;
}

export class ExistingAccessRequestApiDto {
  @ApiProperty({ enum: ProjectRole })
  role: ProjectRole;

  @ApiProperty()
  status: string;
}

export class RequestAccessContextApiDto {
  @ApiProperty({ enum: ['request_access'] })
  decision: 'request_access';

  @ApiProperty({ type: RequestAccessUserApiDto })
  user: RequestAccessUserApiDto;

  @ApiPropertyOptional({ type: RequestAccessOrganizationApiDto, nullable: true })
  organization?: RequestAccessOrganizationApiDto | null;

  @ApiProperty({ type: RequestAccessProjectApiDto })
  project: RequestAccessProjectApiDto;

  @ApiProperty({ enum: ProjectRole, isArray: true })
  availableRoles: ProjectRole[];

  @ApiProperty({ enum: ProjectRole })
  defaultRole: ProjectRole;

  @ApiPropertyOptional({ type: ExistingAccessRequestApiDto, nullable: true })
  existingRequest?: ExistingAccessRequestApiDto | null;
}

export class RequestProjectAccessApiDto {
  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role: ProjectRole;
}

export class RequestProjectAccessResponseApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty({ type: ExistingAccessRequestApiDto })
  request: ExistingAccessRequestApiDto;
}

export class CreateNewProjectResponseApiDto {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectTitle: string;
}
