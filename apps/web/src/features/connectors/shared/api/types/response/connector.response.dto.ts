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
  default?: string | number | boolean | string[] | Record<string, unknown>;
  requiredType?: RequiredType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  minimum?: number;
  attributes?: string[];
  /** Fields that must be filled before this field's dynamic options can be loaded. */
  optionsDependsOn?: string[];
}

export interface ConnectorSpecificationOneOfResponseApiDto {
  label: string;
  value: string;
  requiredType?: RequiredType;
  items: Record<string, ConnectorSpecificationItemResponseApiDto>;
  attributes?: string[];
  oauthParams?: {
    ui_variables?: string[];
  };
}

export interface ConnectorSpecificationResponseApiDto extends ConnectorSpecificationItemResponseApiDto {
  oneOf?: ConnectorSpecificationOneOfResponseApiDto[];
}

export interface ConnectorFieldResponseApiDto {
  name: string;
  type?: string;
  description?: string;
}

/** One allowed value of a configuration field declared with DYNAMIC_OPTIONS. */
export interface ConnectorFieldOptionResponseApiDto {
  value: string;
  label: string;
}

export interface ConnectorFieldsResponseApiDto {
  name: string;
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  uniqueKeysByDataLevel?: Record<string, string[]>;
  defaultFields?: string[];
  destinationName?: string;
  fields?: ConnectorFieldResponseApiDto[];
}
