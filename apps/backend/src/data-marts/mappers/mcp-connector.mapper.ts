import { Injectable } from '@nestjs/common';
import type { ConnectorDefinition } from '../connector-types/connector-definition';
import type { ConnectorSpecification } from '../connector-types/connector-specification';
import type { ConnectorSpecificationItemDto } from '../dto/domain/connector-specification.dto';
import type { ConnectorFieldsSchema } from '../connector-types/connector-fields-schema';
import type { ConnectorFieldOptions } from '../connector-types/connector-field-options';
import { ConnectorMapper } from './connector.mapper';

@Injectable()
export class McpConnectorMapper {
  constructor(private readonly mapper: ConnectorMapper) {}

  toConnectors(connectors: ConnectorDefinition[]) {
    return connectors.map(connector => ({
      name: connector.name,
      title: connector.title,
      description: connector.description,
      docUrl: connector.docUrl,
    }));
  }

  toSpecification(specification: ConnectorSpecification) {
    return this.mapper.toSpecificationDto(specification).map(field => ({
      ...this.withoutSecretValues(field),
      oneOf: field.oneOf?.map(variant => ({
        label: variant.label,
        value: variant.value,
        requiredType: variant.requiredType,
        attributes: variant.attributes,
        items: Object.fromEntries(
          Object.entries(variant.items).map(([key, item]) => [
            key,
            this.withoutSecretValues(item, variant.attributes?.includes('SECRET')),
          ])
        ),
      })),
    }));
  }

  toFields(fields: ConnectorFieldsSchema) {
    return this.mapper.toFieldsDto(fields);
  }

  toFieldOptions(options: ConnectorFieldOptions) {
    return options.map(option => ({ value: option.value, label: option.label }));
  }

  private withoutSecretValues(
    field: ConnectorSpecificationItemDto,
    inheritedSecret = false
  ): ConnectorSpecificationItemDto {
    if (!inheritedSecret && !field.attributes?.includes('SECRET')) return field;
    const { default: _default, options: _options, placeholder: _placeholder, ...metadata } = field;
    return metadata;
  }
}
