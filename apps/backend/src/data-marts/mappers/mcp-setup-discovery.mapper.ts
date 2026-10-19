import { Injectable } from '@nestjs/common';
import type {
  ConnectorSpecification,
  ConnectorSpecificationItem,
} from '../connector-types/connector-specification';
import {
  DataStorageType,
  toHumanReadable,
} from '../data-storage-types/enums/data-storage-type.enum';
import type {
  StorageResourceLeaf,
  StorageResourceNode,
} from '../data-storage-types/interfaces/storage-resource-browser.interface';

import type {
  SetupAuthorizationRequirementDto,
  SetupParameterDto,
  SetupResourceDto,
  SetupStorageDto,
} from '../facades/mcp-setup-discovery.facade';

@Injectable()
export class McpSetupDiscoveryMapper {
  supportsConnectorLoad(type: DataStorageType): boolean {
    // The same five targets implemented by ConnectorStorageConfigService.buildStorageConfig.
    return [
      DataStorageType.GOOGLE_BIGQUERY,
      DataStorageType.AWS_ATHENA,
      DataStorageType.SNOWFLAKE,
      DataStorageType.AWS_REDSHIFT,
      DataStorageType.DATABRICKS,
    ].includes(type);
  }
  toStorage(storage: {
    id: string;
    title?: string | null;
    type: DataStorageType;
    availableForUse: boolean;
    availableForMaintenance: boolean;
  }): SetupStorageDto {
    return {
      id: storage.id,
      title: storage.title || toHumanReadable(storage.type),
      type: storage.type,
      availableForUse: storage.availableForUse,
      availableForMaintenance: storage.availableForMaintenance,
      capabilities: {
        liveResourceBrowsing: storage.type === DataStorageType.GOOGLE_BIGQUERY,
        connectorLoad: this.supportsConnectorLoad(storage.type),
        definitionTypes:
          storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY
            ? ['SQL']
            : storage.type === DataStorageType.GOOGLE_BIGQUERY
              ? ['SQL', 'TABLE', 'VIEW', 'TABLE_PATTERN', 'CONNECTOR']
              : ['SQL', 'TABLE', 'VIEW', 'CONNECTOR'],
      },
    };
  }
  toResource(resource: StorageResourceNode | StorageResourceLeaf): SetupResourceDto {
    return {
      id: resource.id,
      ...(resource.label === undefined ? {} : { label: resource.label }),
      ...('groupId' in resource
        ? {
            groupId: resource.groupId,
            type: resource.type,
            fullyQualifiedName: resource.fullyQualifiedName,
            ...(resource.location === undefined ? {} : { location: resource.location }),
            ...(resource.locationMismatch === undefined
              ? {}
              : { locationMismatch: resource.locationMismatch }),
          }
        : {}),
    };
  }
  toRequirements(specification: ConnectorSpecification): {
    parameters: SetupParameterDto[];
    authorization: SetupAuthorizationRequirementDto[];
  } {
    const parameters: SetupParameterDto[] = [];
    const authorization: SetupAuthorizationRequirementDto[] = [];
    const visit = (item: ConnectorSpecificationItem, path: string, inheritedSecret = false) => {
      const secret = inheritedSecret || !!item.attributes?.includes('SECRET');
      const oauth = !!item.attributes?.includes('OAUTH_FLOW');
      if (secret || oauth) {
        authorization.push({
          path,
          required: item.required === true,
          method: oauth ? 'oauth' : 'credential',
        });
      } else if (!item.attributes?.includes('HIDE_IN_CONFIG_FORM')) {
        parameters.push({
          path,
          required: item.required === true,
          type: item.requiredType ?? 'unknown',
          dynamicOptions: !!item.attributes?.includes('DYNAMIC_OPTIONS'),
          ...(item.minimum === undefined ? {} : { minimum: item.minimum }),
        });
      }
    };
    for (const item of specification) {
      visit(item, item.name);
      for (const variant of item.oneOf ?? []) {
        const path = `${item.name}.${variant.value}`;
        visit(
          {
            name: variant.value,
            attributes: variant.attributes,
            requiredType: variant.requiredType,
          },
          path,
          !!item.attributes?.includes('SECRET')
        );
        for (const [key, child] of Object.entries(variant.items)) {
          visit(
            child,
            `${path}.${key}`,
            !!item.attributes?.includes('SECRET') ||
              !!variant.attributes?.some(
                attribute => attribute === 'SECRET' || attribute === 'OAUTH_FLOW'
              )
          );
        }
      }
    }
    return { parameters, authorization };
  }
}
