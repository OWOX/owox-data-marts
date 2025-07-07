export interface ConnectorDefinitionDto {
  name: string;
  title: string | null;
  description: string | null;
  icon: string | null;
}

export interface ConnectorSpecificationResponseApiDto {
  name: string;
  title?: string;
  description?: string;
  default?: string | number | boolean | object | string[];
  requiredType?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  showInUI?: boolean;
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
  fields?: ConnectorFieldResponseApiDto[];
}
