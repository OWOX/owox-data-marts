import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Role as IdpRole } from '@owox/idp-protocol';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import {
  ContextImpactResponseApiDto,
  ContextResponseApiDto,
  CreateContextRequestApiDto,
  InviteMemberRequestApiDto,
  InviteMemberResponseApiDto,
  UpdateContextMembersRequestApiDto,
  UpdateContextRequestApiDto,
  UpdateEntityContextsRequestApiDto,
  UpdateMemberRequestApiDto,
  UpdateMemberResponseApiDto,
} from '../dto/presentation/context-api.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { ContextMapper } from '../mappers/context.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { ContextService } from '../services/context/context.service';

/**
 * Checked by `error.name` rather than `instanceof` so this file stays free of
 * a runtime import from the ESM-only `@owox/idp-owox-better-auth` package —
 * keeps ts-jest happy in both unit and e2e test suites.
 * Matches the name set by the package's `IdpNotFoundException` constructor.
 */
function isIdpNotFoundError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'IdpNotFoundException';
}

@Controller('contexts')
@ApiTags('Contexts')
export class ContextController {
  constructor(
    private readonly contextService: ContextService,
    private readonly contextAccessService: ContextAccessService,
    private readonly contextMapper: ContextMapper,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Post()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateContextRequestApiDto
  ): Promise<ContextResponseApiDto> {
    const result = await this.contextService.create(
      context.projectId,
      context.userId,
      dto.name,
      dto.description
    );
    return this.contextMapper.toResponse(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  async list(@AuthContext() context: AuthorizationContext): Promise<ContextResponseApiDto[]> {
    const results = await this.contextService.list(context.projectId);
    return results.map(r => this.contextMapper.toResponse(r));
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('members')
  async listMembers(@AuthContext() context: AuthorizationContext): Promise<
    {
      userId: string;
      email: string;
      displayName: string | undefined;
      avatarUrl: string | undefined;
      role: string;
      roleScope: string;
      contextIds: string[];
    }[]
  > {
    const members = await this.idpProjectionsFacade.getProjectMembers(context.projectId);

    return await Promise.all(
      members.map(async member => {
        const [roleScope, contextIds] = await Promise.all([
          this.contextAccessService.getRoleScope(member.userId, context.projectId),
          this.contextAccessService.getMemberContextIds(member.userId, context.projectId),
        ]);

        return {
          userId: member.userId,
          email: member.email,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          role: member.role,
          roleScope,
          contextIds,
        };
      })
    );
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put(':id')
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateContextRequestApiDto
  ): Promise<ContextResponseApiDto> {
    const result = await this.contextService.update(
      id,
      context.projectId,
      dto.name,
      dto.description
    );
    return this.contextMapper.toResponse(result);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Get(':id/impact')
  async getImpact(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<ContextImpactResponseApiDto> {
    const impact = await this.contextService.getImpact(id, context.projectId);
    return {
      contextId: impact.contextId,
      contextName: impact.contextName,
      dataMartCount: impact.dataMartCount,
      storageCount: impact.storageCount,
      destinationCount: impact.destinationCount,
      memberCount: impact.memberCount,
      affectedMemberIds: impact.affectedMemberIds,
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.contextService.delete(id, context.projectId);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put('data-marts/:id/contexts')
  async updateDataMartContexts(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateEntityContextsRequestApiDto
  ): Promise<void> {
    await this.contextAccessService.updateDataMartContexts(
      id,
      context.projectId,
      dto.contextIds,
      context.userId,
      context.roles ?? []
    );
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put(':id/members')
  async setContextMembers(
    @AuthContext() context: AuthorizationContext,
    @Param('id') contextId: string,
    @Body() dto: UpdateContextMembersRequestApiDto
  ): Promise<void> {
    // Strip admin user ids silently — admins have project-wide scope, so
    // binding them to a context is meaningless and backend refuses to store
    // the row. Filtering at the edge keeps the frontend free from the detail.
    const projectMembers = await this.idpProjectionsFacade.getProjectMembers(context.projectId);
    const nonAdminUserIds = new Set(
      projectMembers.filter(m => m.role !== 'admin').map(m => m.userId)
    );
    const assignedUserIds = dto.assignedUserIds.filter(id => nonAdminUserIds.has(id));

    await this.contextAccessService.setContextMembers(
      contextId,
      context.projectId,
      assignedUserIds
    );
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put('members/:userId')
  async updateMember(
    @AuthContext() context: AuthorizationContext,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRequestApiDto
  ): Promise<UpdateMemberResponseApiDto> {
    // Defence-in-depth: the OWOX Java IDP does not block self-modification at
    // its layer (legacy API is trusted to enforce it). Guard here so a single
    // regression upstream cannot lock the caller out of their own project.
    if (context.userId === targetUserId) {
      throw new ForbiddenException('You cannot modify your own membership');
    }

    const projectMembers = await this.idpProjectionsFacade.getProjectMembers(context.projectId);
    const currentMember = projectMembers.find(m => m.userId === targetUserId);
    if (!currentMember) {
      throw new NotFoundException(
        `Member "${targetUserId}" not found in project "${context.projectId}"`
      );
    }

    // Change role in the IDP first — any failure here propagates and leaves
    // the local scope/contexts unchanged. A 404 from upstream means the member
    // was already removed concurrently (our cache is stale) — surface it as a
    // real 404 to the UI so the admin sees "refresh the list" rather than a
    // generic 500.
    if (dto.role !== currentMember.role) {
      try {
        await this.idpProjectionsFacade.changeMemberRole(
          context.projectId,
          targetUserId,
          dto.role as IdpRole,
          context.userId
        );
      } catch (err) {
        if (isIdpNotFoundError(err)) {
          throw new NotFoundException(
            `Member "${targetUserId}" is no longer in project "${context.projectId}". Refresh the list and try again.`
          );
        }
        throw err;
      }
    }

    await this.contextAccessService.updateMember(targetUserId, context.projectId, {
      role: dto.role,
      roleScope: dto.roleScope as RoleScope,
      contextIds: dto.contextIds,
    });

    const [roleScope, contextIds] = await Promise.all([
      this.contextAccessService.getRoleScope(targetUserId, context.projectId),
      this.contextAccessService.getMemberContextIds(targetUserId, context.projectId),
    ]);

    return {
      userId: targetUserId,
      role: dto.role,
      roleScope,
      contextIds,
      roleStatus: 'ok',
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Delete('members/:userId')
  @HttpCode(204)
  async removeMember(
    @AuthContext() context: AuthorizationContext,
    @Param('userId') targetUserId: string
  ): Promise<void> {
    // See updateMember — same self-protection rationale.
    if (context.userId === targetUserId) {
      throw new ForbiddenException('You cannot remove yourself from the project');
    }

    // Guard: only let removal proceed if the member currently exists; otherwise
    // surface 404 without touching local bindings.
    const projectMembers = await this.idpProjectionsFacade.getProjectMembers(context.projectId);
    if (!projectMembers.some(m => m.userId === targetUserId)) {
      throw new NotFoundException(
        `Member "${targetUserId}" not found in project "${context.projectId}"`
      );
    }

    // Idempotent delete: if the IDP says the member is already gone (concurrent
    // removal, stale cache), treat it as success — the admin's intent was
    // "this user should not be in the project", which is satisfied. Still run
    // the local cleanup below to drop orphan scope/context rows.
    try {
      await this.idpProjectionsFacade.removeMember(context.projectId, targetUserId, context.userId);
    } catch (err) {
      if (!isIdpNotFoundError(err)) {
        throw err;
      }
    }

    await this.contextAccessService.removeMemberBindings(targetUserId, context.projectId);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Post('members/invite')
  @HttpCode(202)
  async inviteMember(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: InviteMemberRequestApiDto
  ): Promise<InviteMemberResponseApiDto> {
    const invitation = await this.idpProjectionsFacade.inviteMember(
      context.projectId,
      dto.email,
      dto.role as IdpRole,
      context.userId
    );

    // When the IDP pre-provisions the user (e.g. idp-better-auth returns a
    // real userId alongside the magic link), apply the requested scope and
    // contexts immediately. For IDPs that cannot surface userId until the
    // invitee accepts the invitation (e.g. idp-owox-better-auth email flow),
    // context bindings are deferred until first sign-in.
    if (invitation.userId) {
      const inferredScope =
        (dto.contextIds ?? []).length > 0 ? RoleScope.SELECTED_CONTEXTS : RoleScope.ENTIRE_PROJECT;
      const effectiveScope =
        dto.role === 'admin'
          ? RoleScope.ENTIRE_PROJECT
          : ((dto.roleScope as RoleScope | undefined) ?? inferredScope);
      await this.contextAccessService.updateMember(invitation.userId, context.projectId, {
        role: dto.role,
        roleScope: effectiveScope,
        contextIds: dto.contextIds ?? [],
      });
    }

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

    return {
      ...base,
      kind: 'email-sent',
    };
  }
}
