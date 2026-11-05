import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { GetDataMartRelationshipGraphService } from '../use-cases/get-data-mart-relationship-graph.service';
import { CreateDataMartRelationshipService } from '../use-cases/create-data-mart-relationship.service';
import { UpdateDataMartRelationshipService } from '../use-cases/update-data-mart-relationship.service';
import { DeleteDataMartRelationshipService } from '../use-cases/delete-data-mart-relationship.service';
import {
  PreviewDataMartCommand,
  PreviewDataMartService,
} from '../use-cases/preview-data-mart.service';
import { McpDataMartModelMapper } from '../mappers/mcp-data-mart-model.mapper';
import { safeMcpDataMartErrorMessage } from './mcp-data-mart-diagnostics';
import {
  MCP_MODEL_PREVIEW_DEFAULT_LIMIT,
  MCP_MODEL_PREVIEW_MAX_LIMIT,
  type McpDataMartModelFacade,
  type McpCreateRelationshipInput,
  type McpUpdateRelationshipInput,
} from './mcp-data-mart-model.facade';
import { DATA_MART_ERROR_MESSAGES } from '../errors/data-mart-error-messages';

@Injectable()
export class McpDataMartModelFacadeImpl implements McpDataMartModelFacade {
  constructor(
    private readonly graph: GetDataMartRelationshipGraphService,
    private readonly create: CreateDataMartRelationshipService,
    private readonly update: UpdateDataMartRelationshipService,
    private readonly remove: DeleteDataMartRelationshipService,
    private readonly previewDataMart: PreviewDataMartService,
    private readonly mapper: McpDataMartModelMapper
  ) {}

  async listRelationships(actor: AuthorizationContext, dataMartId: string) {
    return this.safely('Unable to list Data Mart relationships', async () =>
      this.mapper.toGraph(await this.graph.run(this.mapper.toListCommand(actor, dataMartId)))
    );
  }

  async createRelationship(actor: AuthorizationContext, input: McpCreateRelationshipInput) {
    return this.safely('Unable to create Data Mart relationship', async () =>
      this.mapper.toRelationship(await this.create.run(this.mapper.toCreateCommand(actor, input)))
    );
  }

  async updateRelationship(actor: AuthorizationContext, input: McpUpdateRelationshipInput) {
    return this.safely('Unable to update Data Mart relationship', async () =>
      this.mapper.toRelationship(await this.update.run(this.mapper.toUpdateCommand(actor, input)))
    );
  }

  async deleteRelationship(
    actor: AuthorizationContext,
    dataMartId: string,
    relationshipId: string
  ) {
    return this.safely('Unable to delete Data Mart relationship', async () => {
      await this.remove.run(this.mapper.toDeleteCommand(actor, dataMartId, relationshipId));
    });
  }

  async preview(
    actor: AuthorizationContext,
    dataMartId: string,
    limit = MCP_MODEL_PREVIEW_DEFAULT_LIMIT,
    signal?: AbortSignal
  ) {
    return this.safely('Unable to preview Data Mart', async () => {
      if (!Number.isInteger(limit) || limit < 1 || limit > MCP_MODEL_PREVIEW_MAX_LIMIT) {
        throw new BadRequestException(DATA_MART_ERROR_MESSAGES.PREVIEW_LIMIT_INVALID);
      }
      return this.mapper.toPreview(
        await this.previewDataMart.run(
          new PreviewDataMartCommand(
            dataMartId,
            actor.projectId,
            actor.userId,
            actor.roles ?? [],
            limit,
            undefined
          ),
          signal
        )
      );
    });
  }

  private async safely<T>(message: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
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
