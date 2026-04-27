import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import {
  InviteMemberRequestApiDto,
  InviteMemberResponseApiDto,
  UpdateMemberRequestApiDto,
  UpdateMemberResponseApiDto,
} from '../dto/presentation/context-api.dto';
import { InviteProjectMemberCommand } from '../dto/domain/invite-project-member.command';
import { RemoveProjectMemberCommand } from '../dto/domain/remove-project-member.command';
import { UpdateProjectMemberCommand } from '../dto/domain/update-project-member.command';
import { RoleScope } from '../enums/role-scope.enum';
import {
  ListProjectMembersService,
  type ProjectMemberWithScope,
} from '../use-cases/project-members/list-project-members.service';
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
export class ProjectMembersController {
  constructor(
    private readonly listProjectMembers: ListProjectMembersService,
    private readonly inviteProjectMember: InviteProjectMemberService,
    private readonly updateProjectMember: UpdateProjectMemberService,
    private readonly removeProjectMember: RemoveProjectMemberService
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListProjectMembersSpec()
  async list(@AuthContext() context: AuthorizationContext): Promise<ProjectMemberWithScope[]> {
    return this.listProjectMembers.run(context.projectId);
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
        dto.roleScope as RoleScope | undefined,
        dto.contextIds ?? []
      )
    );

    const base = {
      email: invitation.email,
      role: invitation.role,
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
        dto.roleScope as RoleScope,
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
