import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import {
  OWOX_BLUE_BASE,
  OWOX_GRAY_DARK,
  OWOX_GREEN_BASE,
  OWOX_ORANGE_BASE,
  OWOX_PURPLE_BASE,
  OWOX_RED_BASE,
} from './owox-palette';

/**
 * Accent / badge color per definition type, drawn from the OWOX corporate
 * palette. Kept in one place so ERD-style cards across canvases (Models
 * canvas, Joinable Data Marts diagram) stay in sync.
 */
export const DEFINITION_TYPE_ACCENT: Partial<Record<DataMartDefinitionType, string>> = {
  [DataMartDefinitionType.SQL]: OWOX_GREEN_BASE,
  [DataMartDefinitionType.VIEW]: OWOX_BLUE_BASE,
  [DataMartDefinitionType.TABLE]: OWOX_PURPLE_BASE,
  [DataMartDefinitionType.TABLE_PATTERN]: OWOX_RED_BASE,
  [DataMartDefinitionType.CONNECTOR]: OWOX_ORANGE_BASE,
};

export const DEFINITION_TYPE_FALLBACK_ACCENT = OWOX_GRAY_DARK;

export function definitionTypeAccent(type: DataMartDefinitionType | null | undefined): string {
  return type
    ? (DEFINITION_TYPE_ACCENT[type] ?? DEFINITION_TYPE_FALLBACK_ACCENT)
    : DEFINITION_TYPE_FALLBACK_ACCENT;
}
