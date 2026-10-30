import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { AuthorizationContext } from '../../../idp';
import { ConnectorPreviewCredentialsService } from './connector-preview-credentials.service';
import {
  mapConnectorFieldsSchema,
  type SourceFieldsSchema,
} from './connector-fields-schema.mapper';
import {
  type ConnectorPreviewSource,
  connectorSourceImplements,
  createConnectorPreviewSource,
  mapConnectorPreviewError,
  withConnectorPreviewTimeout,
} from './connector-preview-support';

const PREVIEW_ERROR_MESSAGES = {
  timeout: 'Connector field preview timed out',
  unexpected: 'Unable to preview connector fields',
  unexpectedLog: 'Unexpected connector field preview failure',
};

@Injectable()
export class ConnectorFieldsPreviewService {
  private readonly logger = new Logger(ConnectorFieldsPreviewService.name);

  constructor(private readonly previewCredentials: ConnectorPreviewCredentialsService) {}

  async run(
    context: AuthorizationContext,
    connectorName: string,
    configuration: Record<string, unknown>,
    dataMartId?: string
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
        context,
        dataMartId
      );
    } catch (error) {
      if (error instanceof HttpException || error instanceof BusinessViolationException) {
        throw error;
      }
      this.logger.error(`Failed to resolve credentials for ${connectorName} field preview`, error);
      throw new InternalServerErrorException('Unable to resolve credentials for field preview');
    }

    let source: ConnectorPreviewSource;
    try {
      source = createConnectorPreviewSource(connectorName, configWithCredentials, this.logger);
    } catch (error) {
      // A malformed nested value can already fail while the source is assembled.
      throw mapConnectorPreviewError(error, this.logger, PREVIEW_ERROR_MESSAGES);
    }

    try {
      source.context.validate();
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
