import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';
import { AuthorizationContext } from '../../../idp';
import { ConnectorPreviewCredentialsService } from './connector-preview-credentials.service';
import {
  mapConnectorFieldsSchema,
  type SourceFieldsSchema,
} from './connector-fields-schema.mapper';
import {
  connectorSourceImplements,
  createConnectorPreviewSource,
  mapConnectorPreviewError,
  withConnectorPreviewTimeout,
} from './connector-preview-support';

const PREVIEW_ERROR_MESSAGES = {
  timeout: 'Connector field preview timed out',
  unexpected: 'Unable to preview connector fields',
};

@Injectable()
export class ConnectorFieldsPreviewService {
  private readonly logger = new Logger(ConnectorFieldsPreviewService.name);

  constructor(private readonly previewCredentials: ConnectorPreviewCredentialsService) {}

  async run(
    context: AuthorizationContext,
    connectorName: string,
    configuration: Record<string, unknown>
  ): Promise<ConnectorFieldsSchema> {
    if (!connectorSourceImplements(connectorName, 'fetchFieldsSchema')) {
      throw new BadRequestException(
        `Connector '${connectorName}' does not support dynamic field preview`
      );
    }

    let configWithCredentials: Record<string, unknown>;
    try {
      configWithCredentials = await this.previewCredentials.inject(
        connectorName,
        configuration,
        context
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to resolve credentials for ${connectorName} field preview`, error);
      throw new InternalServerErrorException('Unable to resolve credentials for field preview');
    }

    const source = createConnectorPreviewSource(connectorName, configWithCredentials, this.logger);

    try {
      source.config.validate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException({ message });
    }

    try {
      const sourceFieldsSchema = (await withConnectorPreviewTimeout(
        signal => source.fetchFieldsSchema(signal),
        PREVIEW_ERROR_MESSAGES.timeout
      )) as SourceFieldsSchema;
      return ConnectorFieldsSchema.parse(mapConnectorFieldsSchema(sourceFieldsSchema));
    } catch (error) {
      throw mapConnectorPreviewError(error, this.logger, PREVIEW_ERROR_MESSAGES);
    }
  }
}
