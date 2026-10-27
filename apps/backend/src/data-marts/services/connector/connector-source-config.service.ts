// connector-source-config.service.ts
import { Injectable, Logger } from '@nestjs/common';

import { Core } from '@owox/connectors';

const { SourceConfigDto, RunConfigDto } = Core;
type SourceConfigDto = InstanceType<typeof Core.SourceConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorStateItem } from '../../connector-types/interfaces/connector-state';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { unwrapRunPayload } from '../../utils/manual-backfill-range';
import {
  buildOutputSchemaFieldTypesValue,
  OUTPUT_SCHEMA_FIELD_TYPES_PARAMETER,
  OutputSchemaRunContext,
  sourceReadsOutputSchemaFieldTypes,
} from './output-schema-field-types';

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
    state: ConnectorStateItem | undefined,
    // Required, not optional: a caller that left it out would read as "no Output Schema" and
    // let a source infer types for a Data Mart whose columns are already fixed.
    outputSchema: OutputSchemaRunContext
  ): Promise<SourceConfigDto> {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');

    // First inject externalized secrets (non-OAuth secrets stored in connector_source_credentials)
    const configWithSecrets = await this.credentialInjector.injectSecrets(
      config,
      projectId,
      connector.source.name
    );

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
        ...this.buildOutputSchemaParameters(connector.source.name, outputSchema),
      },
    });
  }

  /**
   * The Output Schema type classes for a source that reads them, as a run-time parameter.
   *
   * Always set for such a source, overriding anything a saved configuration might hold; it is
   * unset (undefined) only for a new Data Mart, which tells the source there is nothing to
   * follow yet. Other sources get nothing.
   */
  private buildOutputSchemaParameters(
    sourceName: string,
    outputSchema: OutputSchemaRunContext
  ): Record<string, string | undefined> {
    if (!sourceReadsOutputSchemaFieldTypes(sourceName)) {
      return {};
    }

    return {
      [OUTPUT_SCHEMA_FIELD_TYPES_PARAMETER]: buildOutputSchemaFieldTypesValue(outputSchema),
    };
  }

  buildRunConfig(
    payload?: Record<string, unknown> | null,
    state?: ConnectorStateItem
  ): RunConfigDto {
    const bodyObject = unwrapRunPayload(payload);

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
