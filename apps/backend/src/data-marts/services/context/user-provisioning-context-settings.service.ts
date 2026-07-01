import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { UserProvisioningContextDefaultsDto } from '../../dto/domain/user-provisioning-settings.dto';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { MemberRoleScope } from '../../entities/member-role-scope.entity';
import { UserProvisioningContextSettingsContext } from '../../entities/user-provisioning-context-settings-context.entity';
import { UserProvisioningContextSettings } from '../../entities/user-provisioning-context-settings.entity';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextService } from './context.service';

@Injectable()
export class UserProvisioningContextSettingsService {
  constructor(
    @InjectRepository(UserProvisioningContextSettings)
    private readonly settingsRepository: Repository<UserProvisioningContextSettings>,
    @InjectRepository(UserProvisioningContextSettingsContext)
    private readonly settingsContextRepository: Repository<UserProvisioningContextSettingsContext>,
    @InjectRepository(MemberRoleScope)
    private readonly memberRoleScopeRepository: Repository<MemberRoleScope>,
    @InjectRepository(MemberRoleContext)
    private readonly memberRoleContextRepository: Repository<MemberRoleContext>,
    private readonly contextService: ContextService
  ) {}

  async getDefaultSettings(projectId: string): Promise<UserProvisioningContextDefaultsDto> {
    const settings = await this.settingsRepository.findOne({ where: { projectId } });
    if (!settings || settings.roleScope === RoleScope.ENTIRE_PROJECT) {
      return { roleScope: RoleScope.ENTIRE_PROJECT, contextIds: [] };
    }

    const contextRows = await this.settingsContextRepository.find({ where: { projectId } });
    return {
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: contextRows.map(row => row.contextId),
    };
  }

  async getEffectiveDefaultSettings(
    projectId: string,
    defaultRole: ProjectRole
  ): Promise<UserProvisioningContextDefaultsDto> {
    const settings = await this.getDefaultSettings(projectId);
    return this.normalize(defaultRole, settings.roleScope, settings.contextIds);
  }

  async normalizeAndValidate(
    projectId: string,
    defaultRole: ProjectRole,
    roleScope: RoleScope,
    contextIds: string[]
  ): Promise<UserProvisioningContextDefaultsDto> {
    const normalized = this.normalize(defaultRole, roleScope, contextIds);

    if (
      normalized.roleScope === RoleScope.SELECTED_CONTEXTS &&
      normalized.contextIds.length === 0
    ) {
      throw new BadRequestException(
        'At least one context is required for selected-context defaults'
      );
    }

    if (normalized.contextIds.length > 0) {
      await this.contextService.validateContextIds(normalized.contextIds, projectId);
    }

    return normalized;
  }

  @Transactional()
  async saveDefaultSettings(
    projectId: string,
    settings: UserProvisioningContextDefaultsDto
  ): Promise<UserProvisioningContextDefaultsDto> {
    await this.settingsRepository.upsert(
      {
        projectId,
        roleScope: settings.roleScope,
      },
      ['projectId']
    );

    await this.settingsContextRepository.delete({ projectId });

    if (settings.roleScope === RoleScope.SELECTED_CONTEXTS && settings.contextIds.length > 0) {
      await this.settingsContextRepository.save(
        settings.contextIds.map(contextId => ({ projectId, contextId }))
      );
    }

    return settings;
  }

  @Transactional()
  async applyDefaultScopeToMember(userId: string, projectId: string): Promise<RoleScope> {
    const settings = await this.getDefaultSettings(projectId);
    if (settings.roleScope === RoleScope.ENTIRE_PROJECT) {
      return RoleScope.ENTIRE_PROJECT;
    }

    await this.memberRoleScopeRepository.upsert(
      { userId, projectId, roleScope: RoleScope.SELECTED_CONTEXTS },
      ['userId', 'projectId']
    );
    await this.memberRoleContextRepository.delete({ userId, projectId });
    await this.memberRoleContextRepository.save(
      settings.contextIds.map(contextId => ({ userId, projectId, contextId }))
    );

    return RoleScope.SELECTED_CONTEXTS;
  }

  private normalize(
    defaultRole: ProjectRole,
    roleScope: RoleScope,
    contextIds: string[]
  ): UserProvisioningContextDefaultsDto {
    if (defaultRole === ProjectRole.ADMIN || roleScope === RoleScope.ENTIRE_PROJECT) {
      return { roleScope: RoleScope.ENTIRE_PROJECT, contextIds: [] };
    }

    return {
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds,
    };
  }
}
