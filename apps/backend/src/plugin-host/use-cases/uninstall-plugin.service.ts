import { Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { UninstallPluginCommand } from '../dto/domain/uninstall-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginInstallationService } from '../services/plugin-installation.service';

/**
 * Stops a plugin for one member.
 *
 * Soft by design: the row and its history survive so the member can restore it later,
 * even if no publication makes the plugin visible by then. It changes no publication
 * and cannot reach another member's installation.
 *
 * Deliberately available while the plugin is suspended -- a member must always be able
 * to walk away from a plugin that has gone wrong.
 */
@Injectable()
export class UninstallPluginService {
  constructor(
    private readonly installations: PluginInstallationService,
    private readonly audit: PluginAuditService
  ) {}

  @Transactional()
  async run(command: UninstallPluginCommand): Promise<void> {
    const installation = await this.installations.findOne(
      command.pluginId,
      command.context.projectId,
      command.context.userId
    );

    if (!installation) {
      throw new NotFoundException('You do not have this plugin installed');
    }

    if (installation.uninstalledAt === null) {
      await this.installations.uninstall(installation.id);
    }

    await this.audit.record({
      pluginId: command.pluginId,
      action: PluginAuditAction.UNINSTALL,
      authorityScope: PluginPublicationScope.MEMBER,
      projectId: command.context.projectId,
      userId: command.context.userId,
    });
  }
}
