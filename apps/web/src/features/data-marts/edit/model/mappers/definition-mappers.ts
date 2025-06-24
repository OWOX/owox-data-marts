import { DataMartDefinitionType } from '../../../shared';
import type { DataMartDefinitionDto } from '../../../shared/types/api/response/data-mart-definition.dto';
import type {
  DataMartDefinitionConfig,
  SqlDefinitionConfig,
  TableDefinitionConfig,
  TablePatternDefinitionConfig,
  ViewDefinitionConfig,
} from '../types';
import type {
  SqlDefinitionDto,
  TableDefinitionDto,
  TablePatternDefinitionDto,
  ViewDefinitionDto,
} from '../../../shared/types/api';

/**
 * Maps a SQL definition from the model to the API DTO format
 */
export function mapSqlDefinitionToDto(definition: SqlDefinitionConfig): SqlDefinitionDto {
  return {
    sqlQuery: definition.sqlQuery,
  };
}

/**
 * Maps a SQL definition from API DTO to the model format
 */
export function mapSqlDefinitionFromDto(dto: SqlDefinitionDto): SqlDefinitionConfig {
  return {
    sqlQuery: dto.sqlQuery,
  };
}

/**
 * Maps a table definition from the model to the API DTO format
 */
export function mapTableDefinitionToDto(definition: TableDefinitionConfig): TableDefinitionDto {
  return {
    fullyQualifiedName: definition.fullyQualifiedName,
  };
}

/**
 * Maps a table definition from API DTO to the model format
 */
export function mapTableDefinitionFromDto(dto: TableDefinitionDto): TableDefinitionConfig {
  return {
    fullyQualifiedName: dto.fullyQualifiedName,
  };
}

/**
 * Maps a view definition from the model to the API DTO format
 */
export function mapViewDefinitionToDto(definition: ViewDefinitionConfig): ViewDefinitionDto {
  return {
    fullyQualifiedName: definition.fullyQualifiedName,
  };
}

/**
 * Maps a view definition from API DTO to the model format
 */
export function mapViewDefinitionFromDto(dto: ViewDefinitionDto): ViewDefinitionConfig {
  return {
    fullyQualifiedName: dto.fullyQualifiedName,
  };
}

/**
 * Maps a table pattern definition from the model to the API DTO format
 */
export function mapTablePatternDefinitionToDto(
  definition: TablePatternDefinitionConfig
): TablePatternDefinitionDto {
  return {
    pattern: definition.pattern,
  };
}

/**
 * Maps a table pattern definition from API DTO to the model format
 */
export function mapTablePatternDefinitionFromDto(
  dto: TablePatternDefinitionDto
): TablePatternDefinitionConfig {
  return {
    pattern: dto.pattern,
  };
}

/**
 * Maps a definition from API DTO to the model format based on definition type
 */
export function mapDefinitionFromDto(
  definitionType: DataMartDefinitionType | null,
  definition: DataMartDefinitionDto | null
): DataMartDefinitionConfig | null {
  if (!definitionType || !definition) {
    return null;
  }

  switch (definitionType) {
    case DataMartDefinitionType.SQL:
      return mapSqlDefinitionFromDto(definition as SqlDefinitionDto);

    case DataMartDefinitionType.TABLE:
      return mapTableDefinitionFromDto(definition as TableDefinitionDto);

    case DataMartDefinitionType.VIEW:
      return mapViewDefinitionFromDto(definition as ViewDefinitionDto);

    case DataMartDefinitionType.TABLE_PATTERN:
      return mapTablePatternDefinitionFromDto(definition as TablePatternDefinitionDto);

    default:
      console.warn(`Unknown definition type: ${String(definitionType)}`);
      return null;
  }
}
