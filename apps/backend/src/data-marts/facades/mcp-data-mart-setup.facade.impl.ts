import { Injectable } from '@nestjs/common';
import { DataMartSetupMutationService } from '../use-cases/data-mart-setup-mutation.service';
import type {
  DataMartSetupCreateRequest,
  DataMartSetupDefinitionRequest,
  DataMartSetupMetadataRequest,
  DataMartSetupPublishRequest,
  DataMartSetupDeleteRequest,
} from '../dto/domain/data-mart-setup-mutation.dto';
import { DataMartSetupService } from '../use-cases/data-mart-setup.service';
import type {
  McpDataMartSetupFacade,
  DataMartSetupListRequest,
  DataMartSetupRequest,
  DataMartSetupValidationRequest,
  DataMartSetupImpactRequest,
} from './mcp-data-mart-setup.facade';

@Injectable()
export class McpDataMartSetupFacadeImpl implements McpDataMartSetupFacade {
  constructor(
    private readonly setup: DataMartSetupService,
    private readonly mutations: DataMartSetupMutationService
  ) {}
  create(request: DataMartSetupCreateRequest) {
    return this.mutations.create(request);
  }
  updateDefinition(request: DataMartSetupDefinitionRequest) {
    return this.mutations.updateDefinition(request);
  }
  updateMetadata(request: DataMartSetupMetadataRequest) {
    return this.mutations.updateMetadata(request);
  }
  publish(request: DataMartSetupPublishRequest) {
    return this.mutations.publish(request);
  }
  delete(request: DataMartSetupDeleteRequest) {
    return this.mutations.delete(request);
  }
  list(request: DataMartSetupListRequest) {
    return this.setup.list(request);
  }
  get(request: DataMartSetupRequest) {
    return this.setup.get(request);
  }
  validate(request: DataMartSetupValidationRequest) {
    return this.setup.validate(request);
  }
  impact(request: DataMartSetupImpactRequest) {
    return this.setup.impact(request);
  }
}
