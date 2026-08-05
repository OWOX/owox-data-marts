import type { DataMartStatus } from '../../shared/enums';
import type { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { DataQualityCompactSummary } from '../../shared/types';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';

export interface ModelCanvasJoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

/**
 * A single field rendered as a row inside an ERD node card.
 * Derived from a Data Mart's actualized schema.
 */
export interface CanvasNodeField {
  name: string;
  /** Human-friendly alias (businessName / displayName) when set, else the raw name. */
  alias: string;
  type: string;
  isPrimaryKey: boolean;
  /** Hidden-for-reporting fields (usually surrogate join keys). */
  isHidden: boolean;
}

export interface ModelCanvasNode {
  id: string;
  title: string;
  status: DataMartStatus;
  description: string | null;
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
