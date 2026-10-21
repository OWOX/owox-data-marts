import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import type {
  ListProjectPluginSchedulesCommand,
  ProjectPluginScheduleCommand,
} from '../dto/domain/project-plugin-schedule.command';
import type {
  ProjectPluginSchedulePage,
  ProjectPluginScheduleView,
} from '../dto/domain/project-plugin-schedule.dto';
import type { PluginInstallation } from '../entities/plugin-installation.entity';
import {
  ScheduleNotFoundError,
  ScheduleOwnerCheckUnavailableError,
  ScheduleOwnerNotMemberError,
} from '../errors/plugin-schedule.errors';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import {
  isActiveMember,
  PluginOwnerMembershipService,
} from '../services/plugin-owner-membership.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { pluginNamesById, unique } from './project-plugin-names';
import { isProjectAdmin, isVisibleTo } from './project-plugin-visibility';

@Injectable()
export class ProjectPluginSchedulesService {
  private readonly logger = new Logger(ProjectPluginSchedulesService.name);

  constructor(
    private readonly schedules: PluginActionScheduleService,
    private readonly installations: PluginInstallationService,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly mapper: PluginPresentationMapper,
    private readonly idpProjections: IdpProjectionsFacade,
    private readonly owners: PluginOwnerMembershipService
  ) {}

  async list(command: ListProjectPluginSchedulesCommand): Promise<ProjectPluginSchedulePage> {
    const { context } = command;
    const visible = isProjectAdmin(context)
      ? await this.installations.findByProject(context.projectId)
      : await this.installations.findByMember(context.projectId, context.userId);
    // An installation the caller cannot see reads as one without schedules, never as a refusal.
    const scoped =
      command.installationId === null
        ? visible
        : visible.filter(installation => installation.id === command.installationId);
    const { views, total } = await this.schedules.listForInstallations(
      scoped.map(installation => installation.id),
      command.limit,
      command.offset
    );
    return { items: await this.toItems(context, views, scoped), total };
  }

  async pause(command: ProjectPluginScheduleCommand): Promise<ProjectPluginScheduleView> {
    const installation = await this.manageable(command);
    const view = await this.schedules.pause(installation.id, command.id, {
      byAdmin: installation.userId !== command.context.userId,
    });
    return this.itemOf(command.context, view, installation);
  }

  async resume(command: ProjectPluginScheduleCommand): Promise<ProjectPluginScheduleView> {
    const installation = await this.manageable(command);
    // Its runs would only be skipped; the plugin's own resume comes from the owner, a member.
    const owner = await this.idpProjections
      .getProjectMemberOrThrow(installation.projectId, installation.userId)
      .catch((error: unknown) => {
        this.logger.warn(
          `Plugin schedule owner check failed scheduleId=${command.id} projectId=${installation.projectId}: ${castError(error).message}`
        );
        throw new ScheduleOwnerCheckUnavailableError();
      });
    if (!isActiveMember(owner)) {
      throw new ScheduleOwnerNotMemberError();
    }
    const view = await this.schedules.resume(installation.id, command.id);
    return this.itemOf(command.context, view, installation);
  }

  async delete(command: ProjectPluginScheduleCommand): Promise<void> {
    const installation = await this.manageable(command);
    await this.schedules.delete(installation.id, command.id);
  }

  // Someone else's schedule answers as a missing one, so an id tells a member nothing.
  private async manageable({
    context,
    id,
  }: ProjectPluginScheduleCommand): Promise<PluginInstallation> {
    const installationId = await this.schedules.findInstallationId(id);
    const installation = installationId ? await this.installations.findById(installationId) : null;
    if (!installation || !isVisibleTo(context, installation)) {
      throw new ScheduleNotFoundError();
    }
    return installation;
  }

  private async itemOf(
    context: AuthorizationContext,
    view: PluginScheduleView,
    installation: PluginInstallation
  ): Promise<ProjectPluginScheduleView> {
    const [item] = await this.toItems(context, [view], [installation]);
    return item;
  }

  private async toItems(
    context: AuthorizationContext,
    views: PluginScheduleView[],
    installations: PluginInstallation[]
  ): Promise<ProjectPluginScheduleView[]> {
    const installationById = new Map(
      installations.map(installation => [installation.id, installation])
    );
    const names = await pluginNamesById(
      this.plugins,
      this.versions,
      this.mapper,
      views.map(view => view.pluginId)
    );
    const ownerIds = unique(
      views.flatMap(view => installationById.get(view.installationId)?.userId ?? [])
    );
    const [owners, members] = await Promise.all([
      this.idpProjections.getUserProjectionList(ownerIds),
      this.activeMemberIds(context, ownerIds),
    ]);

    return views.flatMap((view): ProjectPluginScheduleView[] => {
      const installation = installationById.get(view.installationId);
      if (!installation) {
        return [];
      }
      return [
        {
          schedule: view,
          pluginName: names.get(view.pluginId) ?? view.pluginId,
          installationState: installation.uninstalledAt === null ? 'installed' : 'uninstalled',
          owner: owners.getByUserId(installation.userId) ?? null,
          ownerIsMember:
            installation.userId === context.userId || (members?.has(installation.userId) ?? null),
          canManage: isProjectAdmin(context) || installation.userId === context.userId,
        },
      ];
    });
  }

  // The caller is a member; a failed check of the others reads as unknown, not as a list error.
  private async activeMemberIds(
    context: AuthorizationContext,
    ownerIds: string[]
  ): Promise<ReadonlySet<string> | null> {
    if (ownerIds.every(id => id === context.userId)) {
      return null;
    }
    return this.owners.activeMemberIds(context.projectId).catch((error: unknown) => {
      this.logger.warn(
        `Plugin schedule owners check failed projectId=${context.projectId}: ${castError(error).message}`
      );
      return null;
    });
  }
}
