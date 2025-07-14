import { Injectable } from '@nestjs/common';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { CreateDataMartRequestApiDto } from '../dto/presentation/create-data-mart-request-api.dto';
import { CreateDataMartResponseApiDto } from '../dto/presentation/create-data-mart-response-api.dto';
import { DataMartResponseApiDto } from '../dto/presentation/data-mart-response-api.dto';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMart } from '../entities/data-mart.entity';
import { UpdateDataMartDefinitionApiDto } from '../dto/presentation/update-data-mart-definition-api.dto';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { AuthorizationContext } from '../../common/authorization-context/authorization.context';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { UpdateDataMartTitleApiDto } from '../dto/presentation/update-data-mart-title-api.dto';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { UpdateDataMartDescriptionApiDto } from '../dto/presentation/update-data-mart-description-api.dto';
import { UpdateDataMartDescriptionCommand } from '../dto/domain/update-data-mart-description.command';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataStorageMapper } from './data-storage.mapper';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { ValidateDataMartDefinitionCommand } from '../dto/domain/validate-data-mart-definition.command';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { ValidationResult } from '../data-storage-types/interfaces/data-mart-validator.interface';
import { DataMartValidationResponseApiDto } from '../dto/presentation/data-mart-validation-response-api.dto';
import { UpdateDataMartSchemaApiDto } from '../dto/presentation/update-data-mart-schema-api.dto';
import { SqlDryRunCommand } from '../dto/domain/sql-dry-run.command';
import { SqlDryRunRequestApiDto } from '../dto/presentation/sql-dry-run-request-api.dto';
import { SqlDryRunResponseApiDto } from '../dto/presentation/sql-dry-run-response-api.dto';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunsResponseApiDto } from '../dto/presentation/data-mart-runs-response-api.dto';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';

@Injectable()
export class DataMartMapper {
  constructor(private readonly dataStorageMapper: DataStorageMapper) {}

  toCreateDomainCommand(
    context: AuthorizationContext,
    dto: CreateDataMartRequestApiDto
  ): CreateDataMartCommand {
    return new CreateDataMartCommand(context.projectId, context.userId, dto.title, dto.storageId);
  }

  toDomainDto(entity: DataMart): DataMartDto {
    return new DataMartDto(
      entity.id,
      entity.title,
      entity.status,
      this.dataStorageMapper.toDomainDto(entity.storage),
      entity.createdAt,
      entity.modifiedAt,
      entity.definitionType,
      entity.definition,
      entity.description,
      entity.schema
    );
  }

  toDomainDtoList(entities: DataMart[]): DataMartDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  toCreateResponse(dto: DataMartDto): CreateDataMartResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
    };
  }

  toResponse(dto: DataMartDto): DataMartResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      status: dto.status,
      storage: this.dataStorageMapper.toApiResponse(dto.storage),
      definitionType: dto.definitionType,
      definition: dto.definition,
      description: dto.description,
      schema: dto.schema,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toResponseList(dtos: DataMartDto[]): DataMartResponseApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
  }

  toUpdateDefinitionCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataMartDefinitionApiDto
  ): UpdateDataMartDefinitionCommand {
    return new UpdateDataMartDefinitionCommand(
      id,
      context.projectId,
      context.userId,
      dto.definitionType,
      dto.definition
    );
  }

  toGetCommand(id: string, context: AuthorizationContext): GetDataMartCommand {
    return new GetDataMartCommand(id, context.projectId, context.userId);
  }

  toListCommand(context: AuthorizationContext): ListDataMartsCommand {
    return new ListDataMartsCommand(context.projectId, context.userId);
  }

  toUpdateTitleCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataMartTitleApiDto
  ): UpdateDataMartTitleCommand {
    return new UpdateDataMartTitleCommand(id, context.projectId, context.userId, dto.title);
  }

  toUpdateDescriptionCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataMartDescriptionApiDto
  ): UpdateDataMartDescriptionCommand {
    return new UpdateDataMartDescriptionCommand(
      id,
      context.projectId,
      context.userId,
      dto.description
    );
  }

  toPublishCommand(id: string, context: AuthorizationContext): PublishDataMartCommand {
    return new PublishDataMartCommand(id, context.projectId, context.userId);
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteDataMartCommand {
    return new DeleteDataMartCommand(id, context.projectId, context.userId);
  }

  toRunCommand(id: string, context: AuthorizationContext): RunDataMartCommand {
    return new RunDataMartCommand(id, context.projectId, context.userId);
  }

  toDefinitionValidateCommand(
    id: string,
    context: AuthorizationContext
  ): ValidateDataMartDefinitionCommand {
    return new ValidateDataMartDefinitionCommand(id, context.projectId, context.userId);
  }

  toDefinitionValidationResponse(
    validationResult: ValidationResult
  ): DataMartValidationResponseApiDto {
    return {
      valid: validationResult.valid,
      errorMessage: validationResult.errorMessage,
      reason: validationResult.reason,
      details: validationResult.details,
    };
  }

  toActualizeSchemaCommand(
    id: string,
    context: AuthorizationContext
  ): ActualizeDataMartSchemaCommand {
    return new ActualizeDataMartSchemaCommand(id, context.projectId, context.userId);
  }

  toUpdateSchemaCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateDataMartSchemaApiDto
  ): UpdateDataMartSchemaCommand {
    return new UpdateDataMartSchemaCommand(id, context.projectId, context.userId, dto.schema);
  }

  toSqlDryRunCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: SqlDryRunRequestApiDto
  ): SqlDryRunCommand {
    return new SqlDryRunCommand(dataMartId, context.projectId, context.userId, dto.sql);
  }

  toSqlDryRunResponse(result: SqlDryRunResult): SqlDryRunResponseApiDto {
    return {
      isValid: result.isValid,
      error: result.error,
      bytes: result.bytes,
    };
  }

  toRunsResponse(runs: DataMartRun[]): DataMartRunsResponseApiDto {
    return {
      runs: runs.map(run => ({
        id: run.id,
        status: run.status!,
        dataMartId: run.dataMartId,
        definitionRun: run.definitionRun! as SqlDefinition | ConnectorDefinition,
        logs: run.logs || [],
        errors: run.errors || [],
        createdAt: run.createdAt,
      })),
    };
  }
}
