import type { AuthorizationContext } from '../../idp';
import { Injectable } from '@nestjs/common';
import { BigQueryConfigSchema } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { AthenaConfigSchema } from '../data-storage-types/athena/schemas/athena-config.schema';
import { SnowflakeConfigSchema } from '../data-storage-types/snowflake/schemas/snowflake-config.schema';
import { RedshiftConfigSchema } from '../data-storage-types/redshift/schemas/redshift-config.schema';
import { DatabricksWorkspaceConfigSchema } from '../data-storage-types/databricks/schemas/databricks-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import type { DataStorageDto } from '../dto/domain/data-storage.dto';
import type { DataStorageConfig } from '../data-storage-types/data-storage-config.type';
import type { ListStorageResourcesDto } from '../dto/domain/list-storage-resources.dto';
import type {
  McpStorageDto,
  McpStorageValidationDto,
  McpUpdateStorageInput,
  McpSetStorageAccessInput,
} from '../facades/mcp-storage-management.facade';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import type { StorageCredentialSummary } from '../data-storage-types/storage-credential-state';
import {
  ValidationResultCode,
  type ValidationResult,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import type {
  StorageResourceLeaf,
  StorageResourceNode,
} from '../data-storage-types/interfaces/storage-resource-browser.interface';

const configSchemas = {
  [DataStorageType.GOOGLE_BIGQUERY]: BigQueryConfigSchema,
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: BigQueryConfigSchema,
  [DataStorageType.AWS_ATHENA]: AthenaConfigSchema,
  [DataStorageType.SNOWFLAKE]: SnowflakeConfigSchema,
  [DataStorageType.AWS_REDSHIFT]: RedshiftConfigSchema,
  [DataStorageType.DATABRICKS]: DatabricksWorkspaceConfigSchema,
};

@Injectable()
export class McpStorageMapper {
  toSummary(dto: DataStorageDto) {
    return {
      id: dto.id,
      title: dto.title,
      type: dto.type,
      createdAt: dto.createdAt.toISOString(),
      modifiedAt: dto.modifiedAt.toISOString(),
    };
  }

  toStorage(dto: DataStorageDto): McpStorageDto {
    return {
      id: dto.id,
      title: dto.title,
      type: dto.type,
      configuration: this.toConfiguration(dto.type, dto.config),
      credential: this.toCredential(dto.reusableCredential),
      owners: dto.ownerUsers.map(user => ({
        userId: user.userId,
        name: user.fullName ?? null,
        email: user.email ?? null,
      })),
      contexts: dto.contexts.map(context => ({
        id: context.id,
        name: context.name,
        icon: context.icon,
      })),
      availableForUse: dto.availableForUse,
      availableForMaintenance: dto.availableForMaintenance,
      createdAt: dto.createdAt.toISOString(),
      modifiedAt: dto.modifiedAt.toISOString(),
    };
  }

  toUpdateCommand(
    actor: AuthorizationContext,
    id: string,
    input: McpUpdateStorageInput
  ): UpdateDataStorageCommand {
    return new UpdateDataStorageCommand({
      id,
      projectId: actor.projectId,
      config: input.configuration,
      title: input.title,
      reusableCredentialId: input.credentialId,
      userId: actor.userId,
      roles: actor.roles,
    });
  }

  toAccessCommand(
    actor: AuthorizationContext,
    id: string,
    input: McpSetStorageAccessInput
  ): UpdateDataStorageCommand {
    return new UpdateDataStorageCommand({
      id,
      projectId: actor.projectId,
      ownerIds: input.ownerIds === undefined ? undefined : [...new Set(input.ownerIds)],
      userId: actor.userId,
      roles: actor.roles,
      availableForUse: input.availableForUse,
      availableForMaintenance: input.availableForMaintenance,
      contextIds: input.contextIds === undefined ? undefined : [...new Set(input.contextIds)],
    });
  }

  toConfiguration(type: DataStorageType, config: unknown): DataStorageConfig | null {
    const parsed = configSchemas[type].safeParse(config);
    return parsed.success ? parsed.data : null;
  }

  toCredential(
    summary: StorageCredentialSummary | null | undefined
  ): StorageCredentialSummary | null {
    if (!summary) return null;
    if (summary.access === 'pending') return { access: 'pending', state: 'ready' };
    if (summary.access === 'restricted') return { access: 'restricted', state: summary.state };
    return {
      access: 'visible',
      id: summary.id,
      title: summary.title,
      definitionId: summary.definitionId,
      providerName: summary.providerName,
      identity: summary.identity,
      state: summary.state,
    };
  }

  toValidation(result: ValidationResult): McpStorageValidationDto {
    if (result.valid)
      return { valid: true, state: 'valid', message: 'The saved Storage connection is valid.' };
    if (result.code === ValidationResultCode.UNCONFIGURED) {
      return {
        valid: false,
        state: 'unconfigured',
        message: 'Set the Storage configuration and select a Credential.',
      };
    }
    if (result.code === ValidationResultCode.OAUTH_REAUTH_REQUIRED) {
      return {
        valid: false,
        state: 'reauthorization_required',
        message: 'Reconnect or authorize the saved Credential on the Credentials page.',
      };
    }
    if (result.code === ValidationResultCode.INVALID_CONFIGURATION) {
      return {
        valid: false,
        state: 'invalid_configuration',
        message: 'Correct the saved Storage configuration.',
      };
    }
    if (result.code === ValidationResultCode.CREDENTIAL_UNAVAILABLE) {
      return {
        valid: false,
        state: 'credential_unavailable',
        message: 'Enable or replace the saved Credential on the Credentials page.',
      };
    }
    return {
      valid: false,
      state: 'validation_failed',
      message:
        'Storage access could not be verified. Check the saved configuration and Credential.',
    };
  }

  toNamespaces(nodes: StorageResourceNode[]): ListStorageResourcesDto {
    return {
      namespaces: nodes.map(node => ({
        id: node.id,
        ...(node.label !== undefined ? { label: node.label } : {}),
      })),
    };
  }

  toResources(resources: StorageResourceLeaf[]): ListStorageResourcesDto {
    return {
      resources: resources.map(resource => ({
        id: resource.id,
        groupId: resource.groupId,
        type: resource.type,
        fullyQualifiedName: resource.fullyQualifiedName,
        ...(resource.location !== undefined ? { location: resource.location } : {}),
        ...(resource.locationMismatch !== undefined
          ? { locationMismatch: resource.locationMismatch }
          : {}),
      })),
    };
  }
}
