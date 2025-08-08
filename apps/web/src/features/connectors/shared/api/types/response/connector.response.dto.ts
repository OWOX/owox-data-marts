import type { RequiredType } from '../../types';

export interface ConnectorDefinitionDto {
  name: string;
  title: string | null;
  description: string | null;
  logo: string | null;
  docUrl: string | null;
}

export interface ConnectorSpecificationResponseApiDto {
  name: string;
  title?: string;
  description?: string;
  default?: string | number | boolean | object | string[];
  requiredType?: RequiredType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  showInUI?: boolean;
  attributes?: string[];
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
  fields?: ConnectorFieldResponseApiDto[];
}
