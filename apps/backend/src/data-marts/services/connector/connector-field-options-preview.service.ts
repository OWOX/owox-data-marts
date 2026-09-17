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
import { ConnectorService } from './connector.service';
import {
  connectorSourceImplements,
  createConnectorPreviewSource,
  mapConnectorPreviewError,
  withConnectorPreviewTimeout,
} from './connector-preview-support';

const DYNAMIC_OPTIONS_ATTRIBUTE = 'DYNAMIC_OPTIONS';

const PREVIEW_ERROR_MESSAGES = {
  timeout: 'Connector field options preview timed out',
  unexpected: 'Unable to preview connector field options',
  unexpectedLog: 'Unexpected connector field options preview failure',
};

/**
 * Resolves the allowed values of a configuration field declared with the
 * DYNAMIC_OPTIONS attribute (for example the sheet tabs of a spreadsheet).
 *
 * Unlike the fields preview, the whole configuration is not validated up
 * front: the caller is still filling the form, so only the fields the source
 * needs for this lookup are expected to be present. Sources must therefore not
 * rely on validation side effects (defaults, required checks) in
 * `fetchFieldOptions` and report what is missing as a configuration error.
 */
@Injectable()
export class ConnectorFieldOptionsPreviewService {
  private readonly logger = new Logger(ConnectorFieldOptionsPreviewService.name);

  constructor(
    private readonly previewCredentials: ConnectorPreviewCredentialsService,
    private readonly connectorService: ConnectorService
  ) {}

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
    await this.assertFieldDeclaresDynamicOptions(connectorName, field);

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

    try {
      const source = createConnectorPreviewSource(
        connectorName,
        configWithCredentials,
        this.logger
      );
      const options = await withConnectorPreviewTimeout(
        signal => source.fetchFieldOptions(field, signal),
        PREVIEW_ERROR_MESSAGES.timeout
      );
      return ConnectorFieldOptions.parse(options);
    } catch (error) {
      throw mapConnectorPreviewError(error, this.logger, PREVIEW_ERROR_MESSAGES);
    }
  }

  /**
   * The specification is the contract: a field is eligible only when the
   * connector declares it with DYNAMIC_OPTIONS, regardless of what the source
   * method would accept.
   */
  private async assertFieldDeclaresDynamicOptions(
    connectorName: string,
    field: string
  ): Promise<void> {
    const specification = await this.connectorService.getConnectorSpecification(connectorName);
    const item = specification.find(candidate => candidate.name === field);

    if (!item?.attributes?.includes(DYNAMIC_OPTIONS_ATTRIBUTE)) {
      throw new BadRequestException(`Field '${field}' does not provide dynamic options`);
    }
  }
}
