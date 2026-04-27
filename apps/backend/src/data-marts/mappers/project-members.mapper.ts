import { Injectable } from '@nestjs/common';
import { ProjectMemberResponseApiDto } from '../dto/presentation/context-api.dto';
import type { ProjectMemberWithScope } from '../use-cases/project-members/list-project-members.service';

@Injectable()
export class ProjectMembersMapper {
  toApiResponse(member: ProjectMemberWithScope): ProjectMemberResponseApiDto {
    return {
      userId: member.userId,
      email: member.email,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      role: member.role,
      roleScope: member.roleScope,
      contextIds: member.contextIds,
    };
  }

  toApiResponseList(members: ProjectMemberWithScope[]): ProjectMemberResponseApiDto[] {
    return members.map(m => this.toApiResponse(m));
  }
}
