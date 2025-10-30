import { Injectable } from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { ConnectorStateItem } from '../../connector-types/interfaces/connector-state';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';
import { StorageConfigFactory } from './storage-config-builders/storage-config.factory';

const { Config, SourceConfig, RunConfig } = Core;
type Config = InstanceType<typeof Core.Config>;
type SourceConfig = InstanceType<typeof Core.SourceConfig>;
type RunConfig = InstanceType<typeof Core.RunConfig>;

/**
 * Factory for creating connector configurations
 * Handles creation of Config, SourceConfig, and RunConfig objects
 */
@Injectable()
export class ConnectorConfigurationFactory {
  constructor(
    private readonly connectorStateService: ConnectorStateService,
    private readonly storageConfigFactory: StorageConfigFactory
  ) {}

  /**
   * Create complete connector configuration
   */
  async createConfiguration(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>,
    configId: string
  ): Promise<Config> {
    return new Config({
      name: connector.source.name,
      datamartId: dataMart.id,
      source: await this.createSourceConfig(dataMart.id, connector, config, configId),
      storage: this.storageConfigFactory.createStorageConfig(dataMart, connector),
    });
  }

  /**
   * Create source configuration with state management
   */
  async createSourceConfig(
    dataMartId: string,
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>,
    configId: string
  ): Promise<SourceConfig> {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');

    const state = await this.connectorStateService.getState(dataMartId, configId);

    return new SourceConfig({
      name: connector.source.name,
      config: {
        ...config,
        Fields: fieldsConfig,
        ...(state?.state?.date
          ? { LastRequestedDate: new Date(state.state.date as string).toISOString().split('T')[0] }
          : {}),
      },
    });
  }

  /**
   * Create run configuration from payload and state
   */
  createRunConfig(payload?: Record<string, unknown>, state?: ConnectorStateItem): RunConfig {
    const type = payload?.runType || 'INCREMENTAL';
    const data = payload?.data
      ? Object.entries(payload.data).map(([key, value]) => {
          return {
            configField: key,
            value: value,
          };
        })
      : [];

    return new RunConfig({
      type,
      data,
      state: state?.state || {},
    });
  }
}
