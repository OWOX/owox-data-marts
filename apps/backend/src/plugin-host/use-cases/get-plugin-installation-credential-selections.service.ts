import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import { OWOX_AI_SELECTION } from '../../data-marts/credentials/facades/owox-ai.facade';
import { GetPluginInstallationCredentialSelectionsCommand } from '../dto/domain/get-plugin-installation-credential-selections.command';
import { PluginCredentialSelectionsDto } from '../dto/domain/plugin-installation.dto';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { logicalAiRequirement } from '../utils/owox-ai-requirement.util';

/**
 * Which Credential the caller's live installation is granted for each requirement of the
 * current version, so changing the grants starts from them. The logical ai requirement of an
 * installation that uses OWOX AI reports `owox-ai` instead.
 *
 * Only the member's own installation, and never for a plugin runtime token (the
 * controller rejects those): a plugin has no business learning which Credentials the
 * member granted it or any other plugin.
 */
@Injectable()
export class GetPluginInstallationCredentialSelectionsService {
  constructor(
    private readonly installations: PluginInstallationService,
    private readonly pluginService: PluginService,
    private readonly versionService: PluginVersionService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly credentialBindings: CredentialConsumerBindingFacade
  ) {}

  async run(
    command: GetPluginInstallationCredentialSelectionsCommand
  ): Promise<PluginCredentialSelectionsDto> {
    const installation = await this.installations.findById(command.installationId);

    // One 404 for every way of not being entitled to it, as for the entry point.
    if (
      !installation ||
      installation.userId !== command.context.userId ||
      installation.projectId !== command.context.projectId ||
      installation.uninstalledAt !== null
    ) {
      throw new NotFoundException('No active installation was found');
    }

    const plugin = await this.pluginService.findById(installation.pluginId);
    const version = plugin?.currentVersionId
      ? await this.versionService.findById(plugin.currentVersionId)
      : null;

    const requirements = version?.credentialRequirements ?? [];
    const credentialSelections = await this.credentialBindings.listSelections({
      projectId: command.context.projectId,
      consumerType: 'plugin-installation',
      consumerId: installation.id,
      requirements,
    });
    // OWOX AI replaces the binding of the ai requirement, as at runtime.
    const ai = installation.owoxAi ? logicalAiRequirement(requirements) : null;

    return {
      credentialSelections: ai
        ? { ...credentialSelections, [ai.normalized.key]: OWOX_AI_SELECTION }
        : credentialSelections,
    };
  }
}
