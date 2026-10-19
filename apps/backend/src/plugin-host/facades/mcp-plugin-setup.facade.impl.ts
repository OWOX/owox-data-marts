import { PluginSetupMutationService } from '../use-cases/plugin-setup-mutation.service';
import type {
  PluginSetupMutationRequest,
  PluginUninstallRequest,
} from '../dto/domain/mcp-plugin-mutation.dto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { normalizeCredentialRequirement } from '../../data-marts/credentials/credential.types';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import type {
  McpPluginConfigurationDto,
  McpPluginSetupActor,
  McpPluginSetupDto,
  McpPluginSummaryDto,
  McpPluginUpdateDto,
} from '../dto/domain/mcp-plugin-setup.dto';
import { GetPluginDetailsCommand } from '../dto/domain/get-plugin-details.command';
import { GetPluginGalleryCommand } from '../dto/domain/get-plugin-gallery.command';
import { ListInstallationsCommand } from '../dto/domain/list-installations.command';
import { UpdatePluginCommand } from '../dto/domain/update-plugin.command';
import { McpPluginSetupMapper } from '../mappers/mcp-plugin-setup.mapper';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { GetPluginDetailsService } from '../use-cases/get-plugin-details.service';
import { GetPluginGalleryService } from '../use-cases/get-plugin-gallery.service';
import { ListInstallationsService } from '../use-cases/list-installations.service';
import { UpdatePluginService } from '../use-cases/update-plugin.service';
import type { McpPluginSetupFacade } from './mcp-plugin-setup.facade';

@Injectable()
export class McpPluginSetupFacadeImpl implements McpPluginSetupFacade {
  constructor(
    private readonly gallery: GetPluginGalleryService,
    private readonly details: GetPluginDetailsService,
    private readonly history: ListInstallationsService,
    private readonly installations: PluginInstallationService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly bindings: CredentialConsumerBindingFacade,
    private readonly updates: UpdatePluginService,
    private readonly mapper: McpPluginSetupMapper,
    private readonly mutations: PluginSetupMutationService
  ) {}

  installPlugin(request: PluginSetupMutationRequest) {
    this.memberContext(request);
    return this.mutations.mutate(request, 'install');
  }
  updatePluginSetup(request: PluginSetupMutationRequest) {
    this.memberContext(request);
    return this.mutations.mutate(request, 'reconfigure');
  }
  uninstallPlugin(request: PluginUninstallRequest) {
    this.memberContext(request);
    return this.mutations.uninstall(request);
  }

  async listAvailablePlugins(actor: McpPluginSetupActor): Promise<McpPluginSummaryDto[]> {
    const context = this.memberContext(actor);
    const visible = await this.gallery.run(new GetPluginGalleryCommand(context));
    const history = await this.history.run(new ListInstallationsCommand(context, true));
    const byId = new Map([...visible, ...history].map(plugin => [plugin.pluginId, plugin]));
    return [...byId.values()].map(plugin => this.mapper.summary(context.projectId, plugin));
  }

  async getPluginSetup(actor: McpPluginSetupActor, pluginId: string): Promise<McpPluginSetupDto> {
    const context = this.memberContext(actor);
    // Plugin ids are a permitted direct discovery path; installations remain member/project scoped.
    const plugin = await this.details.run(new GetPluginDetailsCommand(pluginId, context));
    const installation = await this.installations.findOne(
      pluginId,
      context.projectId,
      context.userId
    );
    const credentials =
      installation && installation.uninstalledAt === null && plugin.currentVersionId !== null
        ? await this.bindings.inspectConsumerReadiness({
            ...context,
            consumerType: 'plugin-installation',
            consumerId: installation.id,
            requirements: plugin.credentialRequirements,
          })
        : null;
    const readiness: McpPluginSetupDto['readiness'] = plugin.suspended
      ? 'suspended'
      : !plugin.currentVersionId
        ? 'version_unavailable'
        : !installation
          ? 'not_installed'
          : installation.uninstalledAt !== null
            ? 'uninstalled'
            : !credentials?.configured
              ? 'credentials_required'
              : 'configuration_unverified';
    const summary = this.mapper.summary(context.projectId, plugin);
    return {
      plugin: summary,
      installation: installation
        ? {
            installationId: installation.id,
            revision: installation.revision,
            installedAt: installation.installedAt.toISOString(),
            uninstalledAt: installation.uninstalledAt?.toISOString() ?? null,
          }
        : null,
      requirements: plugin.credentialRequirements.map(normalizeCredentialRequirement),
      credentials,
      readiness,
      configuration: this.mapper.configuration(context.projectId, plugin),
      approval: await this.mutations.reviewStatus(context, pluginId),
    };
  }

  async getPluginConfiguration(
    actor: McpPluginSetupActor,
    pluginId: string
  ): Promise<McpPluginConfigurationDto> {
    const context = this.memberContext(actor);
    const plugin = await this.details.run(new GetPluginDetailsCommand(pluginId, context));
    return this.mapper.configuration(context.projectId, plugin);
  }

  async checkPluginUpdates(
    actor: McpPluginSetupActor,
    pluginId: string
  ): Promise<McpPluginUpdateDto> {
    const context = this.memberContext(actor);
    await this.details.run(new GetPluginDetailsCommand(pluginId, context));
    try {
      return this.mapper.update(await this.updates.run(new UpdatePluginCommand(context, pluginId)));
    } catch {
      // Publisher/source diagnostics and arbitrary provider errors cannot cross the MCP boundary.
      throw new ServiceUnavailableException(
        'The managed Plugin update check could not be completed'
      );
    }
  }

  private memberContext(actor: McpPluginSetupActor): McpPluginSetupActor {
    if (
      !actor.projectId?.trim() ||
      !actor.userId?.trim() ||
      !actor.roles.some(role => role === 'admin' || role === 'editor')
    ) {
      throw new ForbiddenException('Plugin setup requires a current project admin or editor');
    }
    return { projectId: actor.projectId, userId: actor.userId, roles: [...actor.roles] };
  }
}
