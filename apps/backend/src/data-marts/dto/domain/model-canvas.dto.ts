import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRelationshipGraphEdgeDto } from './data-mart-relationship-graph-edge.dto';

export interface ModelCanvasNodeDto {
  id: string;
  title: string;
  status: DataMartStatus;
  description: string | null;
  fieldCount: number;
}

export interface ModelCanvasDataMartsDto {
  items: ModelCanvasNodeDto[];
  total: number;
  offset: number;
}

export interface ModelCanvasEdgesDto {
  edges: DataMartRelationshipGraphEdgeDto[];
}
