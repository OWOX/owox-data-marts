import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { PluginSuspensionDto, SuspendPluginCommand } from '../dto/domain/suspend-plugin.command';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { setPluginSuspension } from './set-plugin-suspension';

/**
 * The deployment-wide emergency kill switch.
 *
 * Suspension blocks invocation, installation and restoration. It deliberately leaves
 * uninstalling and updating available, and it never touches publications or
 * installation records -- which is why this service collaborates with nothing but the
 * plugin record and the audit log. The Gallery keeps listing a suspended plugin,
 * marked unavailable, rather than making it vanish from under a member.
 *
 * Soft and idempotent.
 */
@Injectable()
export class SuspendPluginService {
  constructor(
    private readonly authorization: PublicationAuthorizationService,
    private readonly pluginService: PluginService,
    private readonly audit: PluginAuditService
  ) {}

  @Transactional()
  async run(command: SuspendPluginCommand): Promise<PluginSuspensionDto> {
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
        suspended: true,
      }
    );
  }
}
