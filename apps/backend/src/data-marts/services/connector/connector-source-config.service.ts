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
    const payloadObject =
      payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nestedPayload = payloadObject.payload;
    const bodyObject =
      nestedPayload !== null && typeof nestedPayload === 'object'
        ? (nestedPayload as Record<string, unknown>)
        : payloadObject;

    const runTypeRaw = bodyObject.runType;
    const dataRaw = bodyObject.data;

    const type = typeof runTypeRaw === 'string' ? runTypeRaw : 'INCREMENTAL';
    const data =
      dataRaw !== null && typeof dataRaw === 'object'
        ? Object.entries(dataRaw as Record<string, unknown>).map(([configField, value]) => ({
            configField,
            value,
          }))
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
