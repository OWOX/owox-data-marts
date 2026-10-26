import { Injectable, OnModuleInit } from '@nestjs/common';
import { CREDENTIAL_CONSUMER_TYPE_PLUGIN_INSTALLATION } from '../../data-marts/credentials/credential.types';
import { CredentialConsumerTitlesService } from '../../data-marts/credentials/services/credential-consumer-titles.service';
import type { AuthorizationContext } from '../../idp';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { pluginNamesById } from '../use-cases/project-plugin-names';
import { isVisibleTo } from '../use-cases/project-plugin-visibility';
import { PluginInstallationService } from './plugin-installation.service';
import { PluginVersionService } from './plugin-version.service';
import { PluginService } from './plugin.service';

/** Names the plugin installations that use a Credential, on the Credentials page. */
@Injectable()
export class PluginCredentialConsumerTitlesService implements OnModuleInit {
  constructor(
    private readonly consumerTitles: CredentialConsumerTitlesService,
    private readonly installations: PluginInstallationService,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    private readonly mapper: PluginPresentationMapper
  ) {}

  onModuleInit(): void {
    this.consumerTitles.register(CREDENTIAL_CONSUMER_TYPE_PLUGIN_INSTALLATION, (context, ids) =>
      this.visibleTitles(context, ids)
    );
  }

  /** An admin sees every installation in the project, a member only their own. */
  async visibleTitles(
    context: AuthorizationContext,
    installationIds: readonly string[]
  ): Promise<ReadonlyMap<string, string>> {
    const visible = (await this.installations.findByIds(installationIds)).filter(installation =>
      isVisibleTo(context, installation)
    );
    if (visible.length === 0) return new Map();
    const names = await pluginNamesById(
      this.plugins,
      this.versions,
      this.mapper,
      visible.map(installation => installation.pluginId)
    );
    return new Map(
      visible.flatMap(installation => {
        const name = names.get(installation.pluginId);
        return name === undefined ? [] : [[installation.id, name] as const];
      })
    );
  }
}
