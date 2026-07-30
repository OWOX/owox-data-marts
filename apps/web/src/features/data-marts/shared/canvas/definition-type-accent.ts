import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

/**
 * Accent / badge color per definition type, mirroring the OWOX Model Canvas
 * palette (owox/models). Kept in one place so ERD-style cards across canvases
 * (Models canvas, Joinable Data Marts diagram) stay in sync.
 */
export const DEFINITION_TYPE_ACCENT: Partial<Record<DataMartDefinitionType, string>> = {
  [DataMartDefinitionType.SQL]: '#10b981', // emerald
  [DataMartDefinitionType.VIEW]: '#3b82f6', // blue
  [DataMartDefinitionType.TABLE]: '#8b5cf6', // violet
  [DataMartDefinitionType.TABLE_PATTERN]: '#ec4899', // pink
  [DataMartDefinitionType.CONNECTOR]: '#f59e0b', // amber
};

export const DEFINITION_TYPE_FALLBACK_ACCENT = '#94a3b8'; // slate

export function definitionTypeAccent(type: DataMartDefinitionType | null | undefined): string {
  return type
    ? (DEFINITION_TYPE_ACCENT[type] ?? DEFINITION_TYPE_FALLBACK_ACCENT)
    : DEFINITION_TYPE_FALLBACK_ACCENT;
}
