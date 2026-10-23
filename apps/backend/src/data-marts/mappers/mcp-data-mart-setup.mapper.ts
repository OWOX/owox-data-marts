import { Injectable } from '@nestjs/common';
import type { ValidationResult } from '../data-storage-types/interfaces/data-mart-validator.interface';
import type { DataMartDto } from '../dto/domain/data-mart.dto';
import type { DataStorageDto } from '../dto/domain/data-storage.dto';
import { ConnectorDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type {
  McpDataMartConfiguration,
  McpFormulaValidationResult,
  McpFormulaViolation,
  McpStorageResourceList,
} from '../facades/mcp-data-mart-setup.facade';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';

@Injectable()
export class McpDataMartSetupMapper {
  constructor(private readonly connectorSecrets: ConnectorSecretService) {}

  async toConfiguration(dto: DataMartDto): Promise<McpDataMartConfiguration> {
    const definition =
      dto.definitionType === DataMartDefinitionType.CONNECTOR && dto.definition
        ? await this.connectorSecrets.mask(
            dto.projectId,
            ConnectorDefinitionSchema.parse(dto.definition)
          )
        : dto.definition;

    return {
      id: dto.id,
      title: dto.title,
      status: dto.status,
      storage: this.toStorageIdentity(dto.storage),
      definitionType: dto.definitionType ?? null,
      definition: definition ?? null,
      description: dto.description ?? null,
      icon: dto.icon,
      schema: dto.schema ?? null,
      businessOwnerIds: dto.businessOwnerUsers.map(user => user.userId),
      technicalOwnerIds: dto.technicalOwnerUsers.map(user => user.userId),
      availableForReporting: dto.availableForReporting,
      availableForMaintenance: dto.availableForMaintenance,
      contexts: dto.contexts.map(context => ({ id: context.id, name: context.name })),
      blendedFieldsConfig: dto.blendedFieldsConfig ?? null,
      createdAt: dto.createdAt.toISOString(),
      modifiedAt: dto.modifiedAt.toISOString(),
    };
  }

  toIdentity(dto: DataMartDto): { id: string; title: string } {
    return { id: dto.id, title: dto.title };
  }

  toStorageIdentity(dto: DataStorageDto): { id: string; title: string; type: string } {
    return { id: dto.id, title: dto.title, type: dto.type };
  }

  toDefinitionValidation(result: ValidationResult): {
    valid: boolean;
    errorMessage?: string;
    details?: Record<string, unknown>;
    reason?: Record<string, unknown>;
  } {
    return {
      valid: result.valid,
      errorMessage: result.errorMessage,
      details: result.details,
      reason: result.reason,
    };
  }

  toFormulaViolation(violation: McpFormulaViolation): McpFormulaViolation {
    return {
      code: violation.code,
      message: violation.message,
      field: violation.field,
      ...(violation.subject === undefined ? {} : { subject: violation.subject }),
    };
  }

  toFormulaValidation(result: McpFormulaValidationResult): McpFormulaValidationResult {
    return {
      errors: result.errors.map(error => this.toFormulaViolation(error)),
      warnings: result.warnings.map(warning => this.toFormulaViolation(warning)),
      otherFieldErrors: result.otherFieldErrors.map(error => this.toFormulaViolation(error)),
    };
  }

  toStorageResources(result: McpStorageResourceList): McpStorageResourceList {
    return {
      ...(result.namespaces === undefined
        ? {}
        : {
            namespaces: result.namespaces.map(namespace => ({
              id: namespace.id,
              ...(namespace.label === undefined ? {} : { label: namespace.label }),
            })),
          }),
      ...(result.resources === undefined
        ? {}
        : {
            resources: result.resources.map(resource => ({
              id: resource.id,
              groupId: resource.groupId,
              type: resource.type,
              fullyQualifiedName: resource.fullyQualifiedName,
              ...(resource.location === undefined ? {} : { location: resource.location }),
              ...(resource.locationMismatch === undefined
                ? {}
                : { locationMismatch: resource.locationMismatch }),
            })),
          }),
    };
  }
}
