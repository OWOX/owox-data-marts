import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { AvailableConnectors, Connectors, Core } from '@owox/connectors';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';
import { ConnectorCredentialInjectorService } from '../../services/connector/connector-credential-injector.service';

interface SourceFieldsSchema {
  [key: string]: {
    overview?: string;
    description?: string;
    documentation?: string;
    uniqueKeys?: string[];
    defaultFields?: string[];
    destinationName?: string;
    fields?: Record<string, { type?: string; description?: string }>;
  };
}

const previewFieldsConfigContext = new WeakMap<
  object,
  { logger: Logger; connectorName: string }
>();

class PreviewFieldsConfig extends Core.AbstractConfig {
  constructor(
    configData: Record<string, unknown>,
    logger: Logger,
    connectorName: string
  ) {
    super(configData);
    previewFieldsConfigContext.set(this, { logger, connectorName });
  }

  handleStatusUpdate(): void {}

  updateLastImportDate(): void {}

  updateLastRequstedDate(): void {}

  isInProgress(): boolean {
    return false;
  }

  addWarningToCurrentStatus(): void {}

  logMessage(message: string): void {
    const context = previewFieldsConfigContext.get(this);
    context?.logger.debug(`[${context.connectorName}] ${message}`);
  }
}

@Injectable()
export class PreviewFieldsConnectorService {
  private readonly logger = new Logger(PreviewFieldsConnectorService.name);

  constructor(private readonly credentialInjector: ConnectorCredentialInjectorService) {}

  async run(
    connectorName: string,
    projectId: string,
    configuration: Record<string, unknown>
  ): Promise<ConnectorFieldsSchema> {
    if (!AvailableConnectors.includes(connectorName)) {
      throw new NotFoundException(`Connector ${connectorName} not found`);
    }

    const configWithSecrets = await this.credentialInjector.injectSecrets(configuration, projectId);
    const configWithCredentials = await this.credentialInjector.injectOAuthCredentials(
      configWithSecrets,
      connectorName,
      projectId
    );

    const source = this.createSource(connectorName, configWithCredentials);
    if (typeof source.fetchFieldsSchema !== 'function') {
      throw new BadRequestException({
        message: `Connector ${connectorName} does not support field preview`,
      });
    }

    try {
      source.config.validate();
      const sourceFieldsSchema = (await source.fetchFieldsSchema()) as SourceFieldsSchema;
      return ConnectorFieldsSchema.parse(this.mapFieldsSchemaToDto(sourceFieldsSchema));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException({ message });
    }
  }

  private createSource(connectorName: string, configuration: Record<string, unknown>) {
    const SourceClass = Connectors[connectorName][`${connectorName}Source`];
    const sourceConfig = new Core.SourceConfigDto({
      name: connectorName,
      config: configuration,
    });

    return new SourceClass(
      new PreviewFieldsConfig(sourceConfig.config, this.logger, connectorName)
    );
  }

  private mapFieldsSchemaToDto(sourceFieldsSchema: SourceFieldsSchema) {
    return Object.keys(sourceFieldsSchema).map(key => ({
      name: key,
      overview: sourceFieldsSchema[key].overview,
      description: sourceFieldsSchema[key].description,
      documentation: sourceFieldsSchema[key].documentation,
      uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
      defaultFields: sourceFieldsSchema[key].defaultFields,
      destinationName: sourceFieldsSchema[key].destinationName,
      fields: Object.keys(sourceFieldsSchema[key].fields ?? {}).map(fieldKey => ({
        name: fieldKey,
        type: sourceFieldsSchema[key].fields?.[fieldKey].type,
        description: sourceFieldsSchema[key].fields?.[fieldKey].description,
      })),
    }));
  }
}
