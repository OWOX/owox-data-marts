import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { AvailableConnectorService } from '../use-cases/connector/available-connector.service';
import { SpecificationConnectorService } from '../use-cases/connector/specification-connector.service';
import { FieldsConnectorService } from '../use-cases/connector/fields-connector.service';
import { ConnectorFieldsPreviewService } from '../services/connector/connector-fields-preview.service';
import { ConnectorFieldOptionsPreviewService } from '../services/connector/connector-field-options-preview.service';
import { McpConnectorConfigurationService } from '../services/connector/mcp-connector-configuration.service';
import { McpConnectorMapper } from '../mappers/mcp-connector.mapper';
import type { McpConnectorsFacade, McpConnectorPreviewInput } from './mcp-connectors.facade';
import { safeMcpDataMartErrorMessage } from './mcp-data-mart-diagnostics';

@Injectable()
export class McpConnectorsFacadeImpl implements McpConnectorsFacade {
  constructor(
    private readonly available: AvailableConnectorService,
    private readonly specification: SpecificationConnectorService,
    private readonly fields: FieldsConnectorService,
    private readonly fieldsPreview: ConnectorFieldsPreviewService,
    private readonly optionsPreview: ConnectorFieldOptionsPreviewService,
    private readonly configuration: McpConnectorConfigurationService,
    private readonly mapper: McpConnectorMapper
  ) {}

  async list() {
    return this.mapper.toConnectors(await this.available.run());
  }

  async getSpecification(connectorName: string) {
    return this.mapper.toSpecification(await this.specification.run(connectorName));
  }

  async getFields(connectorName: string) {
    return this.mapper.toFields(await this.fields.run(connectorName));
  }

  async previewFields(actor: AuthorizationContext, input: McpConnectorPreviewInput) {
    return this.safePreview('Unable to preview connector fields', async () => {
      const config = await this.previewConfiguration(actor, input);
      return this.mapper.toFields(
        await this.fieldsPreview.run(actor, input.connectorName, config, input.dataMartId)
      );
    });
  }

  async previewFieldOptions(
    actor: AuthorizationContext,
    input: McpConnectorPreviewInput & { field: string }
  ) {
    return this.safePreview('Unable to preview connector field options', async () => {
      const config = await this.previewConfiguration(actor, input);
      return this.mapper.toFieldOptions(
        await this.optionsPreview.run(
          actor,
          input.connectorName,
          input.field,
          config,
          input.dataMartId
        )
      );
    });
  }

  private async previewConfiguration(actor: AuthorizationContext, input: McpConnectorPreviewInput) {
    if (
      Object.hasOwn(input.configuration, '_id') ||
      Object.hasOwn(input.configuration, '_credential_id')
    ) {
      throw new BadRequestException('Select credentials with credential_id');
    }
    await this.configuration.assertNonSecretConfiguration(
      actor.projectId,
      input.connectorName,
      input.configuration
    );
    return {
      ...input.configuration,
      ...(input.configurationId ? { _id: input.configurationId } : {}),
      ...(input.credentialId ? { _credential_id: input.credentialId } : {}),
    };
  }

  private async safePreview<T>(message: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Connector validation and provider errors can contain injected Credential values.
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : error instanceof BusinessViolationException
            ? 400
            : 500;
      throw new HttpException(safeMcpDataMartErrorMessage(error) ?? message, status);
    }
  }
}
