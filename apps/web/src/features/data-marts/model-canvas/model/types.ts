import type { DataMartStatus } from '../../shared/enums';

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
