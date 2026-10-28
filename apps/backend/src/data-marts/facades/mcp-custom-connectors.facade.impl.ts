import { Injectable } from '@nestjs/common';
import { ListCustomConnectorsService } from '../use-cases/custom-connectors/list-custom-connectors.service';
import { GetCustomConnectorService } from '../use-cases/custom-connectors/get-custom-connector.service';
import { CreateCustomConnectorService } from '../use-cases/custom-connectors/create-custom-connector.service';
import { UpdateCustomConnectorMetadataService } from '../use-cases/custom-connectors/update-custom-connector-metadata.service';
import { GetCustomConnectorVersionService } from '../use-cases/custom-connectors/get-custom-connector-version.service';
import { SaveCustomConnectorDraftService } from '../use-cases/custom-connectors/save-custom-connector-draft.service';
import { PublishCustomConnectorService } from '../use-cases/custom-connectors/publish-custom-connector.service';
import { ActivateCustomConnectorVersionService } from '../use-cases/custom-connectors/activate-custom-connector-version.service';
import { DeleteCustomConnectorService } from '../use-cases/custom-connectors/delete-custom-connector.service';
import { GetCustomConnectorSpecificationService } from '../use-cases/custom-connectors/get-custom-connector-specification.service';
import { GetCustomConnectorFieldsService } from '../use-cases/custom-connectors/get-custom-connector-fields.service';
import { TestCustomConnectorService } from '../use-cases/custom-connectors/test-custom-connector.service';
import { ConnectorDefinitionMapper } from '../mappers/connector-definition.mapper';
import type {
  McpCreateCustomConnectorInput,
  McpCustomConnectorActor,
  McpCustomConnectorMetadataInput,
  McpCustomConnectorsFacade,
  McpCustomConnectorTestInput,
} from './mcp-custom-connectors.facade';

@Injectable()
export class McpCustomConnectorsFacadeImpl implements McpCustomConnectorsFacade {
  constructor(
    private readonly listCustomConnectors: ListCustomConnectorsService,
    private readonly getCustomConnector: GetCustomConnectorService,
    private readonly createCustomConnector: CreateCustomConnectorService,
    private readonly updateCustomConnectorMetadata: UpdateCustomConnectorMetadataService,
    private readonly getCustomConnectorVersion: GetCustomConnectorVersionService,
    private readonly saveCustomConnectorDraft: SaveCustomConnectorDraftService,
    private readonly publishCustomConnector: PublishCustomConnectorService,
    private readonly activateCustomConnectorVersion: ActivateCustomConnectorVersionService,
    private readonly deleteCustomConnector: DeleteCustomConnectorService,
    private readonly getCustomConnectorSpecification: GetCustomConnectorSpecificationService,
    private readonly getCustomConnectorFields: GetCustomConnectorFieldsService,
    private readonly testCustomConnector: TestCustomConnectorService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  list(projectId: string) {
    return this.listCustomConnectors.run(this.mapper.toListCommand(projectId));
  }

  get(projectId: string, id: string) {
    return this.getCustomConnector.run(this.mapper.toGetCommand(projectId, id));
  }

  create(actor: McpCustomConnectorActor, input: McpCreateCustomConnectorInput) {
    return this.createCustomConnector.run(this.mapper.toCreateCommand(actor, input));
  }

  updateMetadata(projectId: string, id: string, input: McpCustomConnectorMetadataInput) {
    return this.updateCustomConnectorMetadata.run(
      this.mapper.toUpdateMetadataCommand(projectId, id, input)
    );
  }

  getVersion(projectId: string, id: string, version: number) {
    return this.getCustomConnectorVersion.run(
      this.mapper.toGetVersionCommand(projectId, id, version)
    );
  }

  saveDraft(projectId: string, id: string, manifest: Record<string, unknown>) {
    return this.saveCustomConnectorDraft.run(
      this.mapper.toSaveDraftCommand(projectId, id, manifest)
    );
  }

  publish(actor: McpCustomConnectorActor, id: string) {
    return this.publishCustomConnector.run(this.mapper.toPublishCommand(actor, id));
  }

  activate(actor: McpCustomConnectorActor, id: string, version: number) {
    return this.activateCustomConnectorVersion.run(
      this.mapper.toActivateCommand(actor, id, version)
    );
  }

  delete(projectId: string, id: string) {
    return this.deleteCustomConnector.run(this.mapper.toDeleteCommand(projectId, id));
  }

  getSpecification(projectId: string, id: string, version?: number) {
    return this.getCustomConnectorSpecification.run(
      this.mapper.toSpecificationCommand(projectId, id, version)
    );
  }

  getFields(projectId: string, id: string, version?: number) {
    return this.getCustomConnectorFields.run(this.mapper.toFieldsCommand(projectId, id, version));
  }

  test(projectId: string, input: McpCustomConnectorTestInput) {
    return this.testCustomConnector.run(this.mapper.toTestCommand(projectId, input));
  }
}
