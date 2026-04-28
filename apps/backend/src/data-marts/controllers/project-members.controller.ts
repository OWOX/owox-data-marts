import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import {
  InviteMemberRequestApiDto,
  InviteMemberResponseApiDto,
  ProjectMemberResponseApiDto,
  UpdateMemberRequestApiDto,
  UpdateMemberResponseApiDto,
} from '../dto/presentation/context-api.dto';
import { InviteProjectMemberCommand } from '../dto/domain/invite-project-member.command';
import { RemoveProjectMemberCommand } from '../dto/domain/remove-project-member.command';
import { UpdateProjectMemberCommand } from '../dto/domain/update-project-member.command';
import { ProjectRole } from '../enums/project-role.enum';
import { ProjectMembersMapper } from '../mappers/project-members.mapper';
import { ListProjectMembersService } from '../use-cases/project-members/list-project-members.service';
import { InviteProjectMemberService } from '../use-cases/project-members/invite-project-member.service';
import { UpdateProjectMemberService } from '../use-cases/project-members/update-project-member.service';
import { RemoveProjectMemberService } from '../use-cases/project-members/remove-project-member.service';
import {
  InviteProjectMemberSpec,
  ListProjectMembersSpec,
  RemoveProjectMemberSpec,
  UpdateProjectMemberSpec,
} from './spec/project-members.api';

@Controller('members')
@ApiTags('Project Members')
/**
 * Self-protection (admin cannot remove or change-role on themselves) is
 * enforced inside `RemoveProjectMemberService.run` and
 * `UpdateProjectMemberService.run` — the controller stays a thin glue
 * layer per the codebase convention.
 */
export class ProjectMembersController {
  constructor(
    private readonly listProjectMembers: ListProjectMembersService,
    private readonly inviteProjectMember: InviteProjectMemberService,
    private readonly updateProjectMember: UpdateProjectMemberService,
    private readonly removeProjectMember: RemoveProjectMemberService,
    private readonly projectMembersMapper: ProjectMembersMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListProjectMembersSpec()
  async list(@AuthContext() context: AuthorizationContext): Promise<ProjectMemberResponseApiDto[]> {
    const members = await this.listProjectMembers.run(context.projectId);
    return this.projectMembersMapper.toApiResponseList(members);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Post('invite')
  @HttpCode(202)
  @InviteProjectMemberSpec()
  async invite(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: InviteMemberRequestApiDto
  ): Promise<InviteMemberResponseApiDto> {
    const invitation = await this.inviteProjectMember.run(
      new InviteProjectMemberCommand(
        context.projectId,
        context.userId,
        dto.email,
        dto.role,
        dto.roleScope,
        dto.contextIds ?? []
      )
    );

    const base = {
      email: invitation.email,
      role: invitation.role as ProjectRole,
      message: invitation.message,
      userId: invitation.userId,
    };

    if (invitation.kind === 'magic-link') {
      return {
        ...base,
        kind: 'magic-link',
        magicLink: invitation.magicLink,
        expiresAt: invitation.expiresAt,
      };
    }

    return { ...base, kind: 'email-sent' };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put(':userId')
  @UpdateProjectMemberSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRequestApiDto
  ): Promise<UpdateMemberResponseApiDto> {
    const result = await this.updateProjectMember.run(
      new UpdateProjectMemberCommand(
        context.projectId,
        context.userId,
        targetUserId,
        dto.role,
        dto.roleScope,
        dto.contextIds
      )
    );

    return {
      userId: result.userId,
      role: result.role,
      roleScope: result.roleScope,
      contextIds: result.contextIds,
      roleStatus: 'ok',
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Delete(':userId')
  @HttpCode(204)
  @RemoveProjectMemberSpec()
  async remove(
    @AuthContext() context: AuthorizationContext,
    @Param('userId') targetUserId: string
  ): Promise<void> {
    await this.removeProjectMember.run(
      new RemoveProjectMemberCommand(context.projectId, context.userId, targetUserId)
    );
  }
}
