import type { RequiredType } from '../../types';

export interface ConnectorDefinitionDto {
  name: string;
  title: string | null;
  description: string | null;
  logo: string | null;
  docUrl: string | null;
}

export interface ConnectorSpecificationItemResponseApiDto {
  name: string;
  title?: string;
  description?: string;
  default?: string | number | boolean | object | string[];
  requiredType?: RequiredType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  attributes?: string[];
}

export interface ConnectorSpecificationOneOfResponeApiDto {
  label: string;
  value: string;
  requiredType?: RequiredType;
  items: Record<string, ConnectorSpecificationItemResponseApiDto>;
}

export interface ConnectorSpecificationResponseApiDto
  extends ConnectorSpecificationItemResponseApiDto {
  oneOf?: ConnectorSpecificationOneOfResponeApiDto[];
}

export interface ConnectorFieldResponseApiDto {
  name: string;
  type?: string;
  description?: string;
}

export interface ConnectorFieldsResponseApiDto {
  name: string;
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  destinationName?: string;
  fields?: ConnectorFieldResponseApiDto[];
}
