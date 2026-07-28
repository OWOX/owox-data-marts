import type { DataMartStatus } from '../../shared/enums';
import type { DataLastUpdatedDto } from '../../shared/types/api/response/data-mart-data-last-updated.dto';

export interface ModelCanvasJoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface ModelCanvasNode {
  id: string;
  title: string;
  status: DataMartStatus;
  description: string | null;
  fieldCount: number;
  dataLastUpdated: DataLastUpdatedDto | null;
}

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
