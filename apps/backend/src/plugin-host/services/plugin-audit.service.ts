import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { PluginAuditEvent } from '../entities/plugin-audit-event.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginLifecycleEvent } from '../events/plugin-lifecycle.event';

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
}
