import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';
import type { DataMartSchemaUpdate } from '../data-storage-types/data-mart-schema.type';
import type {
  McpDataMartManagementFacade,
  McpListSetupDataMartsInput,
  McpCreateDataMartInput,
  McpUpdateDataMartDefinitionInput,
} from './mcp-data-mart-management.facade';
import { McpDataMartManagementMapper } from '../mappers/mcp-data-mart-management.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { CreateDataMartService } from '../use-cases/create-data-mart.service';
import { UpdateDataMartTitleService } from '../use-cases/update-data-mart-title.service';
import { UpdateDataMartDescriptionService } from '../use-cases/update-data-mart-description.service';
import { UpdateDataMartIconService } from '../use-cases/update-data-mart-icon.service';
import { UpdateDataMartDefinitionService } from '../use-cases/update-data-mart-definition.service';
import { ValidateDataMartDefinitionService } from '../use-cases/validate-data-mart-definition.service';
import { GetDataMartInputSourceChangeImpactService } from '../use-cases/get-data-mart-input-source-change-impact.service';
import { PublishDataMartService } from '../use-cases/publish-data-mart.service';
import { DeleteDataMartService } from '../use-cases/delete-data-mart.service';
import { ActualizeDataMartSchemaService } from '../use-cases/actualize-data-mart-schema.service';
import { UpdateDataMartSchemaService } from '../use-cases/update-data-mart-schema.service';
import { UpdateDataMartOwnersService } from '../use-cases/update-data-mart-owners.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { UpdateDataMartDescriptionCommand } from '../dto/domain/update-data-mart-description.command';
import { UpdateDataMartIconCommand } from '../dto/domain/update-data-mart-icon.command';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { ValidateDataMartDefinitionCommand } from '../dto/domain/validate-data-mart-definition.command';
import { GetDataMartInputSourceChangeImpactCommand } from '../dto/domain/get-data-mart-input-source-change-impact.command';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import {
  safeMcpDataMartValidationMessage,
  safeMcpSchemaWarnings,
} from './mcp-data-mart-diagnostics';

@Injectable()
export class McpDataMartManagementFacadeImpl implements McpDataMartManagementFacade {
  constructor(
    private readonly listDataMarts: ListDataMartsService,
    private readonly getSetup: GetDataMartService,
    private readonly createDataMart: CreateDataMartService,
    private readonly updateTitleService: UpdateDataMartTitleService,
    private readonly updateDescriptionService: UpdateDataMartDescriptionService,
    private readonly updateIconService: UpdateDataMartIconService,
    private readonly updateDefinitionService: UpdateDataMartDefinitionService,
    private readonly validateDefinition: ValidateDataMartDefinitionService,
    private readonly getImpact: GetDataMartInputSourceChangeImpactService,
    private readonly publishDataMart: PublishDataMartService,
    private readonly deleteDataMart: DeleteDataMartService,
    private readonly actualizeDataMartSchema: ActualizeDataMartSchemaService,
    private readonly updateDataMartSchema: UpdateDataMartSchemaService,
    private readonly updateOwners: UpdateDataMartOwnersService,
    private readonly contexts: ContextAccessService,
    private readonly sharing: UpdateAvailabilityService,
    private readonly mapper: McpDataMartManagementMapper
  ) {}

  async list(actor: AuthorizationContext, input: McpListSetupDataMartsInput) {
    const page = await this.listDataMarts.run(
      new ListDataMartsCommand(
        actor.projectId,
        actor.userId,
        actor.roles ?? [],
        input.offset,
        undefined,
        input.status,
        input.contextIds,
        false,
        input.storageId
      )
    );
    return {
      items: page.items.map(item => this.mapper.toSummary(item)),
      total: page.total,
      offset: page.offset,
    };
  }

  async get(actor: AuthorizationContext, id: string) {
    const dto = await this.getSetup.run(
      new GetDataMartCommand(id, actor.projectId, actor.userId, actor.roles, true)
    );
    return this.mapper.toSetup(dto);
  }

  async create(actor: AuthorizationContext, input: McpCreateDataMartInput) {
    const dto = await this.createDataMart.run(
      new CreateDataMartCommand(
        actor.projectId,
        actor.userId,
        input.title,
        input.storageId,
        actor.roles,
        input.icon
      )
    );
    return this.mapper.toSummary(dto);
  }

  async updateTitle(actor: AuthorizationContext, id: string, title: string) {
    return this.mapper.toSummary(
      await this.updateTitleService.run(
        new UpdateDataMartTitleCommand(id, actor.projectId, title, actor.userId, actor.roles)
      )
    );
  }

  async updateDescription(actor: AuthorizationContext, id: string, description: string) {
    return this.mapper.toSummary(
      await this.updateDescriptionService.run(
        new UpdateDataMartDescriptionCommand(
          id,
          actor.projectId,
          description,
          actor.userId,
          actor.roles
        )
      )
    );
  }

  async updateIcon(actor: AuthorizationContext, id: string, icon: DataMartIconValue | null) {
    return this.mapper.toSummary(
      await this.updateIconService.run(
        new UpdateDataMartIconCommand(id, actor.projectId, icon, actor.userId, actor.roles)
      )
    );
  }

  async updateDefinition(
    actor: AuthorizationContext,
    id: string,
    input: McpUpdateDataMartDefinitionInput
  ) {
    return this.mapper.toSummary(
      await this.updateDefinitionService.run(
        new UpdateDataMartDefinitionCommand(
          id,
          actor.projectId,
          input.definitionType,
          input.definition,
          undefined,
          undefined,
          actor.userId,
          actor.roles
        )
      )
    );
  }

  async validate(actor: AuthorizationContext, id: string) {
    const result = await this.validateDefinition.run(
      new ValidateDataMartDefinitionCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return {
      valid: result.valid,
      message: safeMcpDataMartValidationMessage(result),
    };
  }

  async impact(actor: AuthorizationContext, id: string) {
    return this.getImpact.run(
      new GetDataMartInputSourceChangeImpactCommand(id, actor.projectId, actor.userId, actor.roles)
    );
  }

  async publish(actor: AuthorizationContext, id: string) {
    return this.mapper.toSummary(
      await this.publishDataMart.run(
        new PublishDataMartCommand(id, actor.projectId, actor.userId, actor.roles, actor.userId)
      )
    );
  }

  async delete(actor: AuthorizationContext, id: string) {
    await this.deleteDataMart.run(
      new DeleteDataMartCommand(id, actor.projectId, false, actor.userId, actor.roles)
    );
  }

  async actualizeSchema(actor: AuthorizationContext, id: string) {
    const dto = await this.actualizeDataMartSchema.run(
      new ActualizeDataMartSchemaCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return {
      dataMart: this.mapper.toSummary(dto),
      schema: dto.schema ?? null,
      warningCount: 0,
      warnings: [],
    };
  }

  async updateSchema(actor: AuthorizationContext, id: string, schema: DataMartSchemaUpdate) {
    const dto = await this.updateDataMartSchema.run(
      new UpdateDataMartSchemaCommand(id, actor.projectId, schema, actor.userId, actor.roles)
    );
    return {
      dataMart: this.mapper.toSummary(dto),
      schema: dto.schema ?? null,
      warningCount: dto.warnings.length,
      warnings: safeMcpSchemaWarnings(dto.warnings),
    };
  }

  async setOwners(
    actor: AuthorizationContext,
    id: string,
    businessOwnerIds: string[],
    technicalOwnerIds: string[]
  ) {
    await this.updateOwners.run(
      new UpdateDataMartOwnersCommand(
        id,
        actor.projectId,
        businessOwnerIds,
        technicalOwnerIds,
        actor.userId,
        actor.roles
      )
    );
  }

  async setContexts(actor: AuthorizationContext, id: string, contextIds: string[]) {
    await this.contexts.updateDataMartContexts(
      id,
      actor.projectId,
      contextIds,
      actor.userId,
      actor.roles ?? []
    );
  }

  async setSharing(
    actor: AuthorizationContext,
    id: string,
    availableForReporting: boolean,
    availableForMaintenance: boolean
  ) {
    await this.sharing.updateDataMartSharing(
      id,
      actor.projectId,
      actor.userId,
      actor.roles ?? [],
      availableForReporting,
      availableForMaintenance
    );
  }
}
