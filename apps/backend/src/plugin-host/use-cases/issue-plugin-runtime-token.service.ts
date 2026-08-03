import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { IdpProviderService } from '../../idp/services/idp-provider.service';
import { PluginSuspendedError } from '../errors/plugin-host.errors';
import {
  PLUGIN_INSTALLATION_LOOKUP,
  PluginInstallationLookupPort,
} from '../facades/plugin-installation-lookup.facade';

export interface PluginRuntimeTokenDto {
  readonly runtimeToken: string;
  readonly expiresIn: number;
}

@Injectable()
export class IssuePluginRuntimeTokenService {
  constructor(
    @Inject(PLUGIN_INSTALLATION_LOOKUP)
    private readonly installations: PluginInstallationLookupPort,
    private readonly idpProviderService: IdpProviderService
  ) {}

  async run(installationId: string, context: AuthorizationContext): Promise<PluginRuntimeTokenDto> {
    const installation = await this.installations.findSnapshot(installationId);

    if (
      !installation ||
      !installation.isActive ||
      installation.projectId !== context.projectId ||
      installation.userId !== context.userId
    ) {
      throw new NotFoundException('No active installation was found');
    }

    if (installation.isSuspended) {
      throw new PluginSuspendedError(installation.pluginId);
    }

    const result = await this.idpProviderService
      .getProviderFromApp()
      .issueAccessTokenForPluginRuntime(
        installation.pluginId,
        installation.installationId,
        installation.userId,
        installation.projectId
      );

    if (
      !result.accessToken ||
      typeof result.accessTokenExpiresIn !== 'number' ||
      result.accessTokenExpiresIn <= 0
    ) {
      throw new ServiceUnavailableException('IDP did not issue a valid plugin runtime token');
    }

    return {
      runtimeToken: result.accessToken,
      expiresIn: result.accessTokenExpiresIn,
    };
  }
}
