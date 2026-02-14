import { ApiProperty } from '@nestjs/swagger';
import { ProjectMemberApiDto } from './project-member-api.dto';

export class ProjectMembersResponseApiDto {
  @ApiProperty({ type: [ProjectMemberApiDto] })
  members: ProjectMemberApiDto[];
}
