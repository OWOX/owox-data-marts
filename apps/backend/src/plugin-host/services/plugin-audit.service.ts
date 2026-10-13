import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { PluginAuditEvent } from '../entities/plugin-audit-event.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginLifecycleEvent } from '../events/plugin-lifecycle.event';

export interface PluginHistoryQuery {
  readonly projectId: string;
  readonly userId: string;
  readonly installations: boolean;
  readonly publications: boolean;
  readonly changes: boolean;
  readonly deploymentPluginIds: readonly string[];
  readonly relevantPluginIds: readonly string[];
  readonly afterId: string | null;
  readonly take: number;
}

const INSTALLATION_ACTIONS = [
  PluginAuditAction.INSTALL,
  PluginAuditAction.RESTORE,
  PluginAuditAction.UNINSTALL,
];
const PUBLICATION_ACTIONS = [PluginAuditAction.PUBLISH, PluginAuditAction.UNPUBLISH];
const CHANGE_ACTIONS = [
  PluginAuditAction.UPDATE,
  PluginAuditAction.SUSPEND,
  PluginAuditAction.RESUME,
];

export interface PluginAuditRecord {
  readonly pluginId: string;
  readonly action: PluginAuditAction;
  readonly authorityScope: PluginPublicationScope;
  readonly projectId?: string | null;
  readonly userId?: string | null;
  readonly apiKeyId?: string | null;
  readonly beforeState?: Record<string, unknown> | null;
  readonly afterState?: Record<string, unknown> | null;
}

/**
 * Records security-significant plugin lifecycle actions.
 *
 * Writes both a row and a domain event on purpose. The row is the durable history the
 * spec requires never to be lost; the event is an integration hook whose external bus
 * is frequently unconfigured on self-managed deployments. Never records credentials or
 * GitHub tokens.
 */
@Injectable()
export class PluginAuditService {
  private readonly logger = new Logger(PluginAuditService.name);

  constructor(
    @InjectRepository(PluginAuditEvent)
    private readonly repository: Repository<PluginAuditEvent>,
    private readonly eventDispatcher: OwoxEventDispatcher
  ) {}

  async record(entry: PluginAuditRecord): Promise<void> {
    await this.repository.save(
      this.repository.create({
        pluginId: entry.pluginId,
        action: entry.action,
        authorityScope: entry.authorityScope,
        projectId: entry.projectId ?? null,
        userId: entry.userId ?? null,
        apiKeyId: entry.apiKeyId ?? null,
        beforeState: entry.beforeState ?? null,
        afterState: entry.afterState ?? null,
      })
    );

    try {
      await this.eventDispatcher.publishOnCommit(
        new PluginLifecycleEvent({
          pluginId: entry.pluginId,
          action: entry.action,
          authorityScope: entry.authorityScope,
          projectId: entry.projectId ?? null,
          userId: entry.userId ?? null,
          apiKeyId: entry.apiKeyId ?? null,
        })
      );
    } catch (error) {
      // A missing or failing producer must never cost us the audit entry, which is
      // already committed above.
      this.logger.warn(
        `Audit event for plugin ${entry.pluginId} was not published: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  exists(id: string): Promise<boolean> {
    return this.repository.existsBy({ id });
  }

  // ponytail: no index bounds this scan; when plugin_audit_event passes ~100k rows add (projectId, createdAt) and (pluginId, action, createdAt) and confirm with EXPLAIN on MySQL.
  findHistory(query: PluginHistoryQuery): Promise<PluginAuditEvent[]> {
    const builder = this.repository
      .createQueryBuilder('event')
      .where(
        new Brackets(visible => {
          if (query.installations) {
            visible.orWhere(
              new Brackets(own =>
                own
                  .where('event.action IN (:...installationActions)', {
                    installationActions: INSTALLATION_ACTIONS,
                  })
                  .andWhere('event.projectId = :projectId')
                  .andWhere('event.userId = :userId')
              )
            );
          }
          if (query.publications) {
            visible.orWhere(
              new Brackets(project =>
                project
                  .where('event.action IN (:...publicationActions)')
                  .andWhere('event.authorityScope = :projectScope', {
                    projectScope: PluginPublicationScope.PROJECT,
                  })
                  .andWhere('event.projectId = :projectId')
              )
            );
            visible.orWhere(
              new Brackets(member =>
                member
                  .where('event.action IN (:...publicationActions)')
                  .andWhere('event.authorityScope = :memberScope', {
                    memberScope: PluginPublicationScope.MEMBER,
                  })
                  .andWhere('event.projectId = :projectId')
                  .andWhere('event.userId = :userId')
              )
            );
            if (query.deploymentPluginIds.length > 0) {
              visible.orWhere(
                new Brackets(deployment =>
                  deployment
                    .where('event.action IN (:...publicationActions)')
                    .andWhere('event.authorityScope = :deploymentScope', {
                      deploymentScope: PluginPublicationScope.DEPLOYMENT,
                    })
                    .andWhere('event.pluginId IN (:...deploymentPluginIds)', {
                      deploymentPluginIds: query.deploymentPluginIds,
                    })
                )
              );
            }
          }
          if (query.changes && query.relevantPluginIds.length > 0) {
            visible.orWhere(
              new Brackets(change =>
                change
                  .where('event.action IN (:...changeActions)', { changeActions: CHANGE_ACTIONS })
                  .andWhere('event.pluginId IN (:...relevantPluginIds)', {
                    relevantPluginIds: query.relevantPluginIds,
                  })
              )
            );
          }
        })
      )
      .setParameters({
        projectId: query.projectId,
        userId: query.userId,
        publicationActions: PUBLICATION_ACTIONS,
      });

    if (query.afterId) {
      // Compared against the stored row, not a bound Date: SQLite CURRENT_TIMESTAMP and MySQL datetime keep whole seconds only.
      const anchor =
        '(SELECT anchor.createdAt FROM plugin_audit_event anchor WHERE anchor.id = :afterId)';
      builder.andWhere(
        new Brackets(after =>
          after
            .where(`event.createdAt < ${anchor}`)
            .orWhere(
              new Brackets(tie =>
                tie.where(`event.createdAt = ${anchor}`).andWhere('event.id < :afterId')
              )
            )
        ),
        { afterId: query.afterId }
      );
    }

    return builder
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .limit(query.take)
      .getMany();
  }
}
