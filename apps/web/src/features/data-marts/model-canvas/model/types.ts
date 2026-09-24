import type { ErdCardField } from '../../shared/canvas/erd-fields';
import type { DataMartStatus } from '../../shared/enums';
import type { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { DataQualityCompactSummary } from '../../shared/types';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';
import type { DataMartIconKey } from '../../shared/components/DataMartIcon/data-mart-icons';

export interface ModelCanvasJoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

/**
 * A single field rendered as a row inside an ERD node card.
 * Derived from a Data Mart's actualized schema. The shape itself is the
 * canvas-agnostic `ErdCardField` shared with the Joinable Data Marts diagram.
 */
export type CanvasNodeField = ErdCardField;

export interface ModelCanvasNode {
  id: string;
  title: string;
  status: DataMartStatus;
  description: string | null;
  /** User-picked icon; null draws the default one. */
  icon?: DataMartIconKey | null;
  fieldCount: number;
  /**
   * Definition type + fields are enriched client-side from the Data Mart detail
   * endpoint (the /model-canvas/data-marts list omits them). Optional so the
   * canvas can render a compact card before enrichment resolves.
   */
  definitionType?: DataMartDefinitionType | null;
  fields?: CanvasNodeField[];
  /** Physical reference (table/view path, pattern) or SQL text — enriched client-side. */
  definition?: string | null;
  /** Scheduled triggers of the Data Mart — enriched client-side. */
  triggersCount?: number;
  /** Sharing flags — enriched client-side; unknown until the detail fetch resolves. */
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  /**
   * Relationships this Data Mart takes part in (either side), counted over the
   * storage's whole model — not just what the canvas filters leave on screen.
   */
  relationshipCount?: number;
  qualitySummary: DataQualityCompactSummary;
  dataLastUpdated: DataLastUpdatedDto | null;
}

export type ModelCanvasTopologyNode = Omit<ModelCanvasNode, 'qualitySummary'>;

export interface ModelCanvasEdge {
  id: string;
  sourceDataMartId: string;
  targetDataMartId: string;
  joinConditions: ModelCanvasJoinCondition[];
}

export interface ModelCanvasData {
  nodes: ModelCanvasNode[];
  edges: ModelCanvasEdge[];
}

export interface ModelCanvasTopologyData {
  nodes: ModelCanvasTopologyNode[];
  edges: ModelCanvasEdge[];
}
