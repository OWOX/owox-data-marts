import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  Auth,
  AuthContext,
  AuthorizationContext,
  RejectApiKeyAuth,
  Role,
  Strategy,
} from '../../idp';
import {
  ApproveMembershipRequestApiDto,
  ApproveMembershipRequestResponseApiDto,
  InviteMemberRequestApiDto,
  InviteMemberResponseApiDto,
  MembershipRequestApiDto,
  ProjectMemberResponseApiDto,
  UpdateMemberRequestApiDto,
  UpdateMemberResponseApiDto,
} from '../dto/presentation/context-api.dto';
import { ApproveMembershipRequestCommand } from '../dto/domain/approve-membership-request.command';
import { DeclineMembershipRequestCommand } from '../dto/domain/decline-membership-request.command';
import {
  UpdateUserProvisioningSettingsRequestApiDto,
  UserProvisioningSettingsResponseApiDto,
} from '../dto/presentation/user-provisioning-settings-api.dto';
import { InviteProjectMemberCommand } from '../dto/domain/invite-project-member.command';
import { RemoveProjectMemberCommand } from '../dto/domain/remove-project-member.command';
import { UpdateProjectMemberCommand } from '../dto/domain/update-project-member.command';
import { ProjectRole } from '../enums/project-role.enum';
import { ProjectMembersMapper } from '../mappers/project-members.mapper';
import { ListProjectMembersService } from '../use-cases/project-members/list-project-members.service';
import { InviteProjectMemberService } from '../use-cases/project-members/invite-project-member.service';
import { UpdateProjectMemberService } from '../use-cases/project-members/update-project-member.service';
import { RemoveProjectMemberService } from '../use-cases/project-members/remove-project-member.service';
import { ListMembershipRequestsService } from '../use-cases/project-members/list-membership-requests.service';
import { ApproveMembershipRequestService } from '../use-cases/project-members/approve-membership-request.service';
import { DeclineMembershipRequestService } from '../use-cases/project-members/decline-membership-request.service';
import { GetUserProvisioningSettingsService } from '../use-cases/project-members/get-user-provisioning-settings.service';
import { UpdateUserProvisioningSettingsService } from '../use-cases/project-members/update-user-provisioning-settings.service';
import {
  ApproveMembershipRequestSpec,
  DeclineMembershipRequestSpec,
  GetUserProvisioningSettingsSpec,
  InviteProjectMemberSpec,
  ListMembershipRequestsSpec,
  ListProjectMembersSpec,
  RemoveProjectMemberSpec,
  UpdateProjectMemberSpec,
  UpdateUserProvisioningSettingsSpec,
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
    private readonly listMembershipRequests: ListMembershipRequestsService,
    private readonly approveMembershipRequest: ApproveMembershipRequestService,
    private readonly declineMembershipRequest: DeclineMembershipRequestService,
    private readonly getUserProvisioningSettings: GetUserProvisioningSettingsService,
    private readonly updateUserProvisioningSettings: UpdateUserProvisioningSettingsService,
    private readonly projectMembersMapper: ProjectMembersMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @RejectApiKeyAuth()
  @Get()
  @ListProjectMembersSpec()
  async list(@AuthContext() context: AuthorizationContext): Promise<ProjectMemberResponseApiDto[]> {
    const members = await this.listProjectMembers.run(context.projectId);
    return this.projectMembersMapper.toApiResponseList(members);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
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

  @Auth(Role.viewer(Strategy.PARSE))
  @RejectApiKeyAuth()
  @Get('user-provisioning-settings')
  @GetUserProvisioningSettingsSpec()
  async getProvisioningSettings(
    @AuthContext() context: AuthorizationContext
  ): Promise<UserProvisioningSettingsResponseApiDto> {
    const settings = await this.getUserProvisioningSettings.run(context.projectId, context.userId);
    return this.projectMembersMapper.toUserProvisioningSettingsApiResponse(settings);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Put('user-provisioning-settings')
  @UpdateUserProvisioningSettingsSpec()
  async updateProvisioningSettings(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: UpdateUserProvisioningSettingsRequestApiDto
  ): Promise<UserProvisioningSettingsResponseApiDto> {
    const settings = await this.updateUserProvisioningSettings.run(
      this.projectMembersMapper.toUpdateUserProvisioningSettingsCommand(
        context.projectId,
        context.userId,
        dto
      )
    );

    return this.projectMembersMapper.toUserProvisioningSettingsApiResponse(settings);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
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
  @RejectApiKeyAuth()
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

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Get('requests')
  @ListMembershipRequestsSpec()
  async listRequests(
    @AuthContext() context: AuthorizationContext
  ): Promise<MembershipRequestApiDto[]> {
    const requests = await this.listMembershipRequests.run(context.projectId, context.userId);
    return this.projectMembersMapper.toMembershipRequestApiList(requests);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Post('requests/:requestId/approve')
  @HttpCode(200)
  @ApproveMembershipRequestSpec()
  async approveRequest(
    @AuthContext() context: AuthorizationContext,
    @Param('requestId') requestId: string,
    @Body() dto: ApproveMembershipRequestApiDto
  ): Promise<ApproveMembershipRequestResponseApiDto> {
    const result = await this.approveMembershipRequest.run(
      new ApproveMembershipRequestCommand(
        context.projectId,
        context.userId,
        requestId,
        dto.role,
        dto.roleScope,
        dto.contextIds ?? []
      )
    );
    return {
      userId: result.userId,
      role: result.role,
      roleScope: result.roleScope,
      contextIds: result.contextIds,
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Post('requests/:requestId/decline')
  @HttpCode(204)
  @DeclineMembershipRequestSpec()
  async declineRequest(
    @AuthContext() context: AuthorizationContext,
    @Param('requestId') requestId: string
  ): Promise<void> {
    await this.declineMembershipRequest.run(
      new DeclineMembershipRequestCommand(context.projectId, context.userId, requestId)
    );
  }
}
