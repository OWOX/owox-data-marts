import { DataMartModelMutationService } from '../use-cases/data-mart-model-mutation.service';
import type {
  DataMartModelMutationRequest,
  DataMartModelSchemaRequest,
  DataMartModelRelationshipsRequest,
  DataMartModelAccessRequest,
} from './mcp-data-mart-model.facade';
import { Injectable } from '@nestjs/common';
import { DataMartModelService } from '../use-cases/data-mart-model.service';
import type {
  McpDataMartModelFacade,
  DataMartModelPreviewRequest,
  DataMartModelPreviewDto,
} from './mcp-data-mart-model.facade';

@Injectable()
export class McpDataMartModelFacadeImpl implements McpDataMartModelFacade {
  constructor(
    private readonly model: DataMartModelService,
    private readonly mutations: DataMartModelMutationService
  ) {}

  actualizeSchema(request: DataMartModelMutationRequest) {
    return this.mutations.actualizeSchema(request);
  }
  updateSchema(request: DataMartModelSchemaRequest) {
    return this.mutations.updateSchema(request);
  }
  setRelationships(request: DataMartModelRelationshipsRequest) {
    return this.mutations.setRelationships(request);
  }
  setAccess(request: DataMartModelAccessRequest) {
    return this.mutations.setAccess(request);
  }

  preview(
    request: DataMartModelPreviewRequest,
    signal?: AbortSignal
  ): Promise<DataMartModelPreviewDto> {
    return this.model.preview(request, signal);
  }
}
