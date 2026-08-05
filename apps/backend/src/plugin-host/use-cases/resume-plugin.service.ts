import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { PluginSuspensionDto, ResumePluginCommand } from '../dto/domain/suspend-plugin.command';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { setPluginSuspension } from './set-plugin-suspension';

/**
 * Lifts a deployment-wide suspension.
 *
 * Soft and idempotent. Re-enables active installations on whatever version is current
 * now (updates stay available throughout a suspension, so the current version may have
 * moved on). Publications and installation records are never touched.
 */
@Injectable()
export class ResumePluginService {
  constructor(
    private readonly authorization: PublicationAuthorizationService,
    private readonly pluginService: PluginService,
    private readonly audit: PluginAuditService
  ) {}

  @Transactional()
  async run(command: ResumePluginCommand): Promise<PluginSuspensionDto> {
    return setPluginSuspension(
      {
        authorization: this.authorization,
        pluginService: this.pluginService,
        audit: this.audit,
      },
      {
        repoLocator: command.repoLocator,
        context: command.context,
        note: command.note,
        suspended: false,
      }
    );
  }
}
