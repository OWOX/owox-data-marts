import { ForbiddenException, Injectable } from '@nestjs/common';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import {
  ListStorageResourcesCommand,
  StorageResourceLevel,
} from '../dto/domain/list-storage-resources.command';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { UpdateBlendedFieldsConfigCommand } from '../dto/domain/update-blended-fields-config.command';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { UpdateDataMartDescriptionCommand } from '../dto/domain/update-data-mart-description.command';
import { UpdateDataMartIconCommand } from '../dto/domain/update-data-mart-icon.command';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { ValidateDataMartDefinitionCommand } from '../dto/domain/validate-data-mart-definition.command';
import {
  ValidateFormulaCommand,
  type DraftCalculatedField,
} from '../dto/domain/validate-formula.command';
import type { BlendedFieldsConfig } from '../dto/schemas/blended-fields-config.schema';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';
import { McpDataMartSetupMapper } from '../mappers/mcp-data-mart-setup.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { ActualizeDataMartSchemaService } from '../use-cases/actualize-data-mart-schema.service';
import { CreateDataMartService } from '../use-cases/create-data-mart.service';
import { DeleteDataMartService } from '../use-cases/delete-data-mart.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';
import { ListStorageResourcesService } from '../use-cases/list-storage-resources.service';
import { PublishDataMartService } from '../use-cases/publish-data-mart.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { UpdateBlendedFieldsConfigService } from '../use-cases/update-blended-fields-config.service';
import { UpdateDataMartDefinitionService } from '../use-cases/update-data-mart-definition.service';
import { UpdateDataMartDescriptionService } from '../use-cases/update-data-mart-description.service';
import { UpdateDataMartIconService } from '../use-cases/update-data-mart-icon.service';
import { UpdateDataMartOwnersService } from '../use-cases/update-data-mart-owners.service';
import { UpdateDataMartSchemaService } from '../use-cases/update-data-mart-schema.service';
import { UpdateDataMartTitleService } from '../use-cases/update-data-mart-title.service';
import { ValidateDataMartDefinitionService } from '../use-cases/validate-data-mart-definition.service';
import { ValidateFormulaService } from '../use-cases/validate-formula.service';
import type {
  McpDataMartConfiguration,
  McpDataMartDefinitionInput,
  McpDataMartSetupContext,
  McpDataMartSetupFacade,
  McpDataMartTarget,
  McpFormulaValidationResult,
  McpFormulaViolation,
  McpStorageResourceList,
} from './mcp-data-mart-setup.facade';

@Injectable()
export class McpDataMartSetupFacadeImpl implements McpDataMartSetupFacade {
  constructor(
    private readonly getDataMartService: GetDataMartService,
    private readonly createDataMartService: CreateDataMartService,
    private readonly updateTitle: UpdateDataMartTitleService,
    private readonly updateDescription: UpdateDataMartDescriptionService,
    private readonly updateIcon: UpdateDataMartIconService,
    private readonly updateDefinition: UpdateDataMartDefinitionService,
    private readonly updateSchema: UpdateDataMartSchemaService,
    private readonly updateOwners: UpdateDataMartOwnersService,
    private readonly availability: UpdateAvailabilityService,
    private readonly contextAccess: ContextAccessService,
    private readonly updateBlendedFieldsConfig: UpdateBlendedFieldsConfigService,
    private readonly publish: PublishDataMartService,
    private readonly deleteService: DeleteDataMartService,
    private readonly validateDefinition: ValidateDataMartDefinitionService,
    private readonly validateFormula: ValidateFormulaService,
    private readonly actualizeSchema: ActualizeDataMartSchemaService,
    private readonly listStorages: ListDataStoragesService,
    private readonly listResources: ListStorageResourcesService,
    private readonly accessDecision: AccessDecisionService,
    private readonly mapper: McpDataMartSetupMapper
  ) {}

  async getDataMart(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'viewer');
    return this.readConfiguration(ctx, input.dataMartId);
  }

  async createDataMart(
    ctx: McpDataMartSetupContext,
    input: { title: string; storageId: string; icon?: DataMartIconValue | null }
  ): Promise<{ id: string; title: string }> {
    this.requireRole(ctx, 'editor');
    const result = await this.createDataMartService.run(
      new CreateDataMartCommand(
        ctx.projectId,
        ctx.userId,
        input.title,
        input.storageId,
        ctx.roles,
        input.icon ?? null
      )
    );
    return this.mapper.toIdentity(result);
  }

  async updateDataMartMetadata(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & {
      title?: string;
      description?: string | null;
      icon?: DataMartIconValue | null;
    }
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'editor');
    // Keep domain validation, authorization, legacy synchronization and indexing for each field.
    if (input.title !== undefined) {
      await this.updateTitle.run(
        new UpdateDataMartTitleCommand(
          input.dataMartId,
          ctx.projectId,
          input.title,
          ctx.userId,
          ctx.roles
        )
      );
    }
    if (input.description !== undefined) {
      await this.updateDescription.run(
        new UpdateDataMartDescriptionCommand(
          input.dataMartId,
          ctx.projectId,
          input.description,
          ctx.userId,
          ctx.roles
        )
      );
    }
    if (input.icon !== undefined) {
      await this.updateIcon.run(
        new UpdateDataMartIconCommand(
          input.dataMartId,
          ctx.projectId,
          input.icon,
          ctx.userId,
          ctx.roles
        )
      );
    }
    return this.readConfiguration(ctx, input.dataMartId);
  }

  async updateDataMartDefinition(
    ctx: McpDataMartSetupContext,
    input: McpDataMartDefinitionInput
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'editor');
    await this.updateDefinition.run(
      new UpdateDataMartDefinitionCommand(
        input.dataMartId,
        ctx.projectId,
        input.definitionType,
        input.definition,
        input.sourceDataMartId,
        input.sourceConfigurationId,
        ctx.userId,
        ctx.roles
      )
    );
    return this.readConfiguration(ctx, input.dataMartId);
  }

  async updateDataMartSchema(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { schema: unknown }
  ): Promise<McpDataMartConfiguration & { warnings: McpFormulaViolation[] }> {
    this.requireRole(ctx, 'editor');
    const schema = DataMartSchemaSchema.parse(input.schema);
    const result = await this.updateSchema.run(
      new UpdateDataMartSchemaCommand(
        input.dataMartId,
        ctx.projectId,
        schema,
        ctx.userId,
        ctx.roles
      )
    );
    return {
      ...(await this.readConfiguration(ctx, input.dataMartId)),
      warnings: result.warnings.map(warning => this.mapper.toFormulaViolation(warning)),
    };
  }

  async updateDataMartOwners(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { businessOwnerIds: string[]; technicalOwnerIds: string[] }
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'editor');
    const result = await this.updateOwners.run(
      new UpdateDataMartOwnersCommand(
        input.dataMartId,
        ctx.projectId,
        input.businessOwnerIds,
        input.technicalOwnerIds,
        ctx.userId,
        ctx.roles
      )
    );
    return this.mapper.toConfiguration(result);
  }

  async updateDataMartAvailability(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { availableForReporting: boolean; availableForMaintenance: boolean }
  ): Promise<void> {
    this.requireRole(ctx, 'viewer');
    await this.availability.updateDataMartSharing(
      input.dataMartId,
      ctx.projectId,
      ctx.userId,
      ctx.roles,
      input.availableForReporting,
      input.availableForMaintenance
    );
  }

  async updateDataMartContexts(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { contextIds: string[] }
  ): Promise<void> {
    this.requireRole(ctx, 'editor');
    // The context updater authorizes ownership but does not load the Data Mart in this project.
    await this.getDataMartService.run(
      new GetDataMartCommand(input.dataMartId, ctx.projectId, ctx.userId, ctx.roles)
    );
    await this.contextAccess.updateDataMartContexts(
      input.dataMartId,
      ctx.projectId,
      input.contextIds,
      ctx.userId,
      ctx.roles
    );
  }

  async updateDataMartBlendedFieldsConfig(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { blendedFieldsConfig: BlendedFieldsConfig | null }
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'editor');
    await this.updateBlendedFieldsConfig.run(
      new UpdateBlendedFieldsConfigCommand(
        input.dataMartId,
        ctx.projectId,
        input.blendedFieldsConfig,
        ctx.userId,
        ctx.roles
      )
    );
    return this.readConfiguration(ctx, input.dataMartId);
  }

  async publishDataMart(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'editor');
    await this.publish.run(
      new PublishDataMartCommand(input.dataMartId, ctx.projectId, ctx.userId, ctx.roles, ctx.userId)
    );
    return this.readConfiguration(ctx, input.dataMartId);
  }

  async deleteDataMart(ctx: McpDataMartSetupContext, input: McpDataMartTarget): Promise<void> {
    this.requireRole(ctx, 'editor');
    await this.deleteService.run(
      new DeleteDataMartCommand(input.dataMartId, ctx.projectId, false, ctx.userId, ctx.roles)
    );
  }

  async validateDataMartDefinition(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<{
    valid: boolean;
    errorMessage?: string;
    details?: Record<string, unknown>;
    reason?: Record<string, unknown>;
  }> {
    this.requireRole(ctx, 'editor');
    const result = await this.validateDefinition.run(
      new ValidateDataMartDefinitionCommand(input.dataMartId, ctx.projectId, ctx.userId, ctx.roles)
    );
    return this.mapper.toDefinitionValidation(result);
  }

  async validateDataMartFormula(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & {
      name: string;
      type: string;
      formula: string;
      calculatedFields?: DraftCalculatedField[];
    }
  ): Promise<McpFormulaValidationResult> {
    this.requireRole(ctx, 'editor');
    const result = await this.validateFormula.run(
      new ValidateFormulaCommand(
        input.dataMartId,
        ctx.projectId,
        input.name,
        input.type,
        input.formula,
        ctx.userId,
        ctx.roles,
        input.calculatedFields
      )
    );
    return this.mapper.toFormulaValidation(result);
  }

  async actualizeDataMartSchema(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<McpDataMartConfiguration> {
    this.requireRole(ctx, 'editor');
    await this.actualizeSchema.run(
      new ActualizeDataMartSchemaCommand(input.dataMartId, ctx.projectId, ctx.userId, ctx.roles)
    );
    return this.readConfiguration(ctx, input.dataMartId);
  }

  async listDataStorages(
    ctx: McpDataMartSetupContext
  ): Promise<Array<{ id: string; title: string; type: string }>> {
    this.requireRole(ctx, 'viewer');
    const storages = await this.listStorages.run(
      new ListDataStoragesCommand(ctx.projectId, ctx.userId, ctx.roles)
    );
    const permissions = await this.accessDecision.canAccessMany(
      ctx.userId,
      ctx.roles,
      EntityType.STORAGE,
      storages.map(storage => storage.id),
      Action.USE,
      ctx.projectId
    );
    return storages
      .filter(storage => permissions.get(storage.id) === true)
      .map(storage => this.mapper.toStorageIdentity(storage));
  }

  async listStorageResources(
    ctx: McpDataMartSetupContext,
    input: {
      storageId: string;
      level: 'namespaces' | 'resources';
      namespaceId?: string;
      resourceType?: 'TABLE' | 'VIEW' | 'TABLE_PATTERN';
    }
  ): Promise<McpStorageResourceList> {
    this.requireRole(ctx, 'viewer');
    const level =
      input.level === 'namespaces'
        ? StorageResourceLevel.NAMESPACES
        : StorageResourceLevel.RESOURCES;
    const result = await this.listResources.run(
      new ListStorageResourcesCommand(
        input.storageId,
        ctx.projectId,
        ctx.userId,
        ctx.roles,
        level,
        input.namespaceId,
        input.resourceType
      )
    );
    return this.mapper.toStorageResources(result);
  }

  private async readConfiguration(
    ctx: McpDataMartSetupContext,
    dataMartId: string
  ): Promise<McpDataMartConfiguration> {
    // Mutation DTOs omit owner projections; the authorized read returns the complete configuration.
    const result = await this.getDataMartService.run(
      new GetDataMartCommand(dataMartId, ctx.projectId, ctx.userId, ctx.roles)
    );
    return this.mapper.toConfiguration(result);
  }

  private requireRole(ctx: McpDataMartSetupContext, role: 'viewer' | 'editor'): void {
    if (!ctx.userId?.trim() || !ctx.projectId?.trim() || !satisfiesRole(ctx.roles, role)) {
      throw new ForbiddenException(`An authenticated project ${role} is required`);
    }
  }
}
