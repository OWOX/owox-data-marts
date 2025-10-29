import { Injectable } from '@nestjs/common';
import { ConnectorDefinition } from '../connector-types/connector-definition';
import {
  ConnectorSpecification,
  ConnectorSpecificationSchema,
  ConnectorSpecificationItem,
} from '../connector-types/connector-specification';
import { ConnectorFieldsSchema } from '../connector-types/connector-fields-schema';
import { ConnectorDefinitionResponseApiDto } from '../dto/presentation/connector-definition-response-api.dto';
import {
  ConnectorSpecificationResponseApiDto,
  ConnectorSpecificationItemResponseApiDto,
  ConnectorSpecificationOneOfOptionResponseApiDto,
} from '../dto/presentation/connector-specification-response-api.dto';
import { ConnectorFieldsResponseApiDto } from '../dto/presentation/connector-fields-response-api.dto';

@Injectable()
export class ConnectorMapper {
  toDefinitionResponse(definition: ConnectorDefinition): ConnectorDefinitionResponseApiDto {
    return {
      name: definition.name,
      title: definition.title,
      description: definition.description,
      logo: definition.logo,
      docUrl: definition.docUrl,
    };
  }

  toDefinitionResponseList(
    definitions: ConnectorDefinition[]
  ): ConnectorDefinitionResponseApiDto[] {
    return definitions.map(definition => this.toDefinitionResponse(definition));
  }

  toSpecificationResponse(
    specification: ConnectorSpecification
  ): ConnectorSpecificationResponseApiDto[] {
    return specification.map(item => this.specificationItemToResponse(item));
  }

  toFieldsResponse(fields: ConnectorFieldsSchema): ConnectorFieldsResponseApiDto[] {
    return fields.map(field => ({
      name: field.name,
      overview: field.overview,
      description: field.description,
      documentation: field.documentation,
      uniqueKeys: field.uniqueKeys,
      destinationName: field.destinationName,
      fields: field.fields?.map(field => ({
        name: field.name,
        type: field.type,
        description: field.description,
      })),
    }));
  }

  private mapSpecificationItem(
    item: ConnectorSpecificationItem
  ): ConnectorSpecificationItemResponseApiDto {
    return {
      name: item.name,
      title: item.title,
      description: item.description,
      default: item.default,
      requiredType: item.requiredType,
      required: item.required,
      options: item.options,
      placeholder: item.placeholder,
      attributes: item.attributes,
    };
  }

  private specificationItemToResponse(
    item: ConnectorSpecificationSchema
  ): ConnectorSpecificationResponseApiDto {
    return {
      name: item.name,
      title: item.title,
      description: item.description,
      default: item.default,
      requiredType: item.requiredType,
      required: item.required,
      options: item.options,
      placeholder: item.placeholder,
      attributes: item.attributes,
      oneOf: item.oneOf?.map(
        (oneOf): ConnectorSpecificationOneOfOptionResponseApiDto => ({
          label: oneOf.label,
          value: oneOf.value,
          requiredType: oneOf.requiredType,
          items: Object.entries(oneOf.items).reduce(
            (acc, [key, value]) => {
              acc[key] = this.mapSpecificationItem(value);
              return acc;
            },
            {} as Record<string, ConnectorSpecificationItemResponseApiDto>
          ),
        })
      ),
    };
  }
}
