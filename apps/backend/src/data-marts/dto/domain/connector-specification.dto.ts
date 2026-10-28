export interface ConnectorSpecificationItemDto {
  name: string;
  title?: string;
  description?: string;
  default?: unknown;
  requiredType?: 'string' | 'number' | 'boolean' | 'bool' | 'object' | 'array' | 'date';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  minimum?: number;
  attributes?: string[];
  optionsDependsOn?: string[];
}

export interface ConnectorSpecificationDto extends ConnectorSpecificationItemDto {
  oneOf?: Array<{
    label: string;
    value: string;
    requiredType?: ConnectorSpecificationItemDto['requiredType'];
    attributes?: string[];
    items: Record<string, ConnectorSpecificationItemDto>;
  }>;
}
