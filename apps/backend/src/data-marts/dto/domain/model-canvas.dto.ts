import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRelationshipGraphEdgeDto } from './data-mart-relationship-graph-edge.dto';
import { SourceDataLastUpdatedSummary } from '../schemas/source-data-last-updated.schema';

export interface ModelCanvasNodeDto {
  id: string;
  title: string;
  status: DataMartStatus;
  description: string | null;
  fieldCount: number;
  /** Last-known snapshot; the canvas refresh button re-computes it per visible node. */
  dataLastUpdated: SourceDataLastUpdatedSummary | null;
}

export interface ModelCanvasDataMartsDto {
  items: ModelCanvasNodeDto[];
  total: number;
  offset: number;
}

export interface ModelCanvasEdgesDto {
  edges: DataMartRelationshipGraphEdgeDto[];
}
