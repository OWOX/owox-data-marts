import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConnectorFieldOptions } from '../../connector-types/connector-field-options';
import { AuthorizationContext } from '../../../idp';
import { ConnectorPreviewCredentialsService } from './connector-preview-credentials.service';
import {
  connectorSourceImplements,
  createConnectorPreviewSource,
  mapConnectorPreviewError,
  withConnectorPreviewTimeout,
} from './connector-preview-support';

const PREVIEW_ERROR_MESSAGES = {
  timeout: 'Connector field options preview timed out',
  unexpected: 'Unable to preview connector field options',
};

/**
 * Resolves the allowed values of a configuration field declared with the
 * DYNAMIC_OPTIONS attribute (for example the sheet tabs of a spreadsheet).
 *
 * Unlike the fields preview, the whole configuration is not validated up
 * front: the caller is still filling the form, so only the fields the source
 * needs for this lookup are expected to be present. The source reports what is
 * missing through a configuration error.
 */
@Injectable()
export class ConnectorFieldOptionsPreviewService {
  private readonly logger = new Logger(ConnectorFieldOptionsPreviewService.name);

  constructor(private readonly previewCredentials: ConnectorPreviewCredentialsService) {}

  async run(
    context: AuthorizationContext,
    connectorName: string,
    field: string,
    configuration: Record<string, unknown>
  ): Promise<ConnectorFieldOptions> {
    if (!connectorSourceImplements(connectorName, 'fetchFieldOptions')) {
      throw new BadRequestException(
        `Connector '${connectorName}' does not support dynamic field options`
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
      this.logger.error(
        `Failed to resolve credentials for ${connectorName} field options preview`,
        error
      );
      throw new InternalServerErrorException(
        'Unable to resolve credentials for field options preview'
      );
    }

    const source = createConnectorPreviewSource(connectorName, configWithCredentials, this.logger);

    try {
      const options = await withConnectorPreviewTimeout(
        signal => source.fetchFieldOptions(field, signal),
        PREVIEW_ERROR_MESSAGES.timeout
      );
      return ConnectorFieldOptions.parse(options);
    } catch (error) {
      throw mapConnectorPreviewError(error, this.logger, PREVIEW_ERROR_MESSAGES);
    }
  }
}
