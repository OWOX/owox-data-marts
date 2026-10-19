import type { Role } from '@owox/idp-protocol';
import type { NormalizedCredentialRequirement } from '../../../data-marts/credentials/credential.types';
import type { CredentialConsumerReadiness } from '../../../data-marts/credentials/facades/credential-consumer-binding.facade';
import type { PluginInstallationState } from './plugin-view.dto';

export interface McpPluginSetupActor {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: Role[];
}

export interface McpPluginSummaryDto {
  readonly pluginId: string;
  readonly displayName: string;
  readonly description: string;
  readonly currentVersionId: string | null;
  readonly currentSemver: string | null;
  readonly installationState: PluginInstallationState;
  readonly suspended: boolean;
  readonly detailsUrl: string;
}

export interface McpPluginConfigurationDto {
  readonly pluginId: string;
  readonly mode: 'app';
  readonly verification: 'unknown';
  readonly appUrl: string;
  readonly manualStep: string;
}

export interface McpPluginSetupDto {
  readonly plugin: McpPluginSummaryDto;
  readonly installation: {
    readonly installationId: string;
    readonly revision: number;
    readonly installedAt: string;
    readonly uninstalledAt: string | null;
  } | null;
  readonly requirements: readonly NormalizedCredentialRequirement[];
  readonly credentials: CredentialConsumerReadiness | null;
  readonly readiness:
    | 'not_installed'
    | 'uninstalled'
    | 'suspended'
    | 'version_unavailable'
    | 'credentials_required'
    | 'configuration_unverified';
  readonly configuration: McpPluginConfigurationDto;
  readonly approval: { readonly status: 'required_in_app' | 'completed'; readonly appUrl: string };
}

export interface McpPluginUpdateDto {
  readonly pluginId: string;
  readonly currentVersionId: string | null;
  readonly currentSemver: string | null;
  readonly outcome: 'updated' | 'up_to_date' | 'already_running' | 'failed';
  readonly nextCheckAt: string | null;
  readonly sharedDeploymentEffect: true;
  readonly effect: string;
}
