// connector-source-config.service.ts
import { Injectable, Logger } from '@nestjs/common';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { SourceConfigDto, RunConfigDto } = Core;
type SourceConfigDto = InstanceType<typeof Core.SourceConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorStateItem } from '../../connector-types/interfaces/connector-state';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';

@Injectable()
export class ConnectorSourceConfigService {
  private readonly logger = new Logger(ConnectorSourceConfigService.name);

  constructor(private readonly credentialInjector: ConnectorCredentialInjectorService) {}

  async buildSourceConfig(
    dataMartId: string,
    projectId: string,
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>,
    configId: string,
    state?: ConnectorStateItem
  ): Promise<SourceConfigDto> {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');

    // First inject externalized secrets (non-OAuth secrets stored in connector_source_credentials)
    const configWithSecrets = await this.credentialInjector.injectSecrets(config, projectId);

    // Then inject OAuth credentials
    const configWithCredentials = await this.credentialInjector.injectOAuthCredentials(
      configWithSecrets,
      connector.source.name,
      projectId
    );

    return new SourceConfigDto({
      name: connector.source.name,
      config: {
        ...configWithCredentials,
        Fields: fieldsConfig,
        ...(state?.state?.date
          ? { LastRequestedDate: new Date(state.state.date as string).toISOString().split('T')[0] }
          : {}),
      },
    });
  }

  buildRunConfig(
    payload?: Record<string, unknown> | null,
    state?: ConnectorStateItem
  ): RunConfigDto {
    const bodyRaw = (payload as { payload?: unknown } | null)?.payload;
    const body =
      bodyRaw !== null && typeof bodyRaw === 'object'
        ? (bodyRaw as { runType?: string; data?: Record<string, unknown> })
        : undefined;

    const type = body?.runType ?? 'INCREMENTAL';
    const data = body?.data
      ? Object.entries(body.data).map(([configField, value]) => ({ configField, value }))
      : [];

    this.logger.debug(`Creating run config`, { payload, state });
    this.logger.debug(`Returning run config`, { type, data, state: state?.state || {} });

    return new RunConfigDto({
      type,
      data,
      state: state?.state || {},
    });
  }
}
