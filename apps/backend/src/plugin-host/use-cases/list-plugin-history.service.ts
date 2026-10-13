import { BadRequestException, Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ListPluginHistoryCommand } from '../dto/domain/list-plugin-history.command';
import {
  PluginHistoryAction,
  PluginHistoryActorDto,
  PluginHistoryEventDto,
  PluginHistoryPageDto,
} from '../dto/domain/plugin-history.dto';
import { PluginAuditEvent } from '../entities/plugin-audit-event.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

const isPublication = (row: PluginAuditEvent): boolean =>
  row.action === PluginAuditAction.PUBLISH || row.action === PluginAuditAction.UNPUBLISH;

/** A member's plugin history in one project; deployment audiences are today's rows, withdrawn ones included. */
@Injectable()
export class ListPluginHistoryService {
  constructor(
    private readonly audit: PluginAuditService,
    private readonly publications: PluginPublicationService,
    private readonly installations: PluginInstallationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    private readonly mapper: PluginPresentationMapper,
    private readonly idpProjections: IdpProjectionsFacade
  ) {}

  async run(command: ListPluginHistoryCommand): Promise<PluginHistoryPageDto> {
    const { projectId, userId } = command.context;
    if (command.cursor && !(await this.audit.exists(command.cursor))) {
      throw new BadRequestException('cursor does not point to a plugin history entry');
    }

    const [listed, installed] = await Promise.all([
      this.publications.findEverVisibleTo(projectId, userId),
      this.installations.findByMember(projectId, userId),
    ]);
    const rows = await this.audit.findHistory({
      projectId,
      userId,
      installations: command.type !== 'publications',
      publications: command.type !== 'installations',
      changes: command.type === 'all',
      deploymentPluginIds: unique(
        listed
          .filter(publication => publication.scope === PluginPublicationScope.DEPLOYMENT)
          .map(publication => publication.pluginId)
      ),
      relevantPluginIds: unique([...listed, ...installed].map(row => row.pluginId)),
      afterId: command.cursor,
      take: command.limit + 1,
    });

    const page = rows.slice(0, command.limit);
    const items = await this.toItems(page, projectId, userId);
    return {
      items,
      nextCursor: rows.length > command.limit ? page[page.length - 1].id : null,
    };
  }

  private async toItems(
    page: PluginAuditEvent[],
    projectId: string,
    userId: string
  ): Promise<PluginHistoryEventDto[]> {
    const plugins = await this.pluginService.findByIds(unique(page.map(row => row.pluginId)));
    const pluginById = new Map(plugins.map(plugin => [plugin.id, plugin]));
    const versions = await this.versionService.findByIds(
      unique(
        [
          ...plugins.map(plugin => plugin.currentVersionId),
          ...page.map(row => this.versionIdAfter(row)),
        ].filter((id): id is string => typeof id === 'string')
      )
    );
    const versionById = new Map(versions.map(version => [version.id, version]));

    const namedIds = unique(
      page.filter(row => this.isNameable(row, projectId, userId)).map(row => row.userId as string)
    );
    const names = await this.idpProjections.getUserProjectionList(namedIds);

    return page.flatMap(row => {
      const plugin = pluginById.get(row.pluginId);
      if (!plugin || this.isNoOp(row)) {
        return [];
      }
      const versionId = this.versionIdAfter(row);
      return [
        {
          id: row.id,
          occurredAt: row.createdAt,
          action: row.action as PluginHistoryAction,
          scope: isPublication(row) ? row.authorityScope : null,
          plugin: this.mapper.toHistoryPlugin(
            plugin,
            plugin.currentVersionId ? (versionById.get(plugin.currentVersionId) ?? null) : null
          ),
          actor: this.actorOf(row, projectId, userId, names),
          version:
            row.action === PluginAuditAction.UPDATE && versionId
              ? (versionById.get(versionId)?.semver ?? null)
              : null,
        },
      ];
    });
  }

  private actorOf(
    row: PluginAuditEvent,
    projectId: string,
    userId: string,
    names: Awaited<ReturnType<IdpProjectionsFacade['getUserProjectionList']>>
  ): PluginHistoryActorDto | null {
    if (
      row.action === PluginAuditAction.SUSPEND ||
      row.action === PluginAuditAction.RESUME ||
      (isPublication(row) && row.authorityScope === PluginPublicationScope.DEPLOYMENT)
    ) {
      return { kind: 'deployment' };
    }
    if (row.userId === userId) {
      return { kind: 'you' };
    }
    if (!this.isNameable(row, projectId, userId)) {
      return null;
    }
    const projection = names.getByUserId(row.userId as string);
    const name = projection?.fullName || projection?.email;
    return name ? { kind: 'member', name } : null;
  }

  /** Only someone who acted in this very project is named, so other projects' members stay private. */
  private isNameable(row: PluginAuditEvent, projectId: string, userId: string): boolean {
    return (
      row.userId !== null &&
      row.userId !== userId &&
      row.projectId === projectId &&
      row.authorityScope !== PluginPublicationScope.DEPLOYMENT &&
      row.action !== PluginAuditAction.SUSPEND &&
      row.action !== PluginAuditAction.RESUME
    );
  }

  /** A restore of an active row or an uninstall of a removed one changed nothing. */
  private isNoOp(row: PluginAuditEvent): boolean {
    const uninstalled = row.beforeState?.uninstalled;
    return (
      (row.action === PluginAuditAction.RESTORE && uninstalled === false) ||
      (row.action === PluginAuditAction.UNINSTALL && uninstalled === true)
    );
  }

  private versionIdAfter(row: PluginAuditEvent): string | null {
    const id = row.afterState?.currentVersionId;
    return typeof id === 'string' ? id : null;
  }
}
