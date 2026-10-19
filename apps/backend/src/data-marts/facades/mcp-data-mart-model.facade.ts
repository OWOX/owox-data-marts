import type {
  DataMartModelMutationDto,
  DataMartModelMutationRequest,
  DataMartModelSchemaRequest,
  DataMartModelRelationshipsRequest,
  DataMartModelAccessRequest,
} from '../dto/domain/data-mart-model-mutation.dto';
export type {
  DataMartModelMutationDto,
  DataMartModelMutationRequest,
  DataMartModelSchemaRequest,
  DataMartModelRelationshipsRequest,
  DataMartModelAccessRequest,
} from '../dto/domain/data-mart-model-mutation.dto';
import type {
  DataMartModelPreviewDto,
  DataMartModelPreviewRequest,
} from '../dto/domain/data-mart-model.dto';

export type {
  DataMartModelPreviewDto,
  DataMartModelPreviewRequest,
} from '../dto/domain/data-mart-model.dto';
export const MCP_DATA_MART_MODEL_FACADE = Symbol('MCP_DATA_MART_MODEL_FACADE');

export interface McpDataMartModelFacade {
  actualizeSchema(request: DataMartModelMutationRequest): Promise<DataMartModelMutationDto>;
  updateSchema(request: DataMartModelSchemaRequest): Promise<DataMartModelMutationDto>;
  setRelationships(request: DataMartModelRelationshipsRequest): Promise<DataMartModelMutationDto>;
  setAccess(request: DataMartModelAccessRequest): Promise<DataMartModelMutationDto>;

  preview(
    request: DataMartModelPreviewRequest,
    signal?: AbortSignal
  ): Promise<DataMartModelPreviewDto>;
}
