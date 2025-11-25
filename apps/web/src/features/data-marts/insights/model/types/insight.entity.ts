import type { DataMartRunItem } from '../../../edit';

export interface InsightEntity {
  id: string;
  title: string;
  template: string | null;
  output: string | null;
  outputUpdatedAt: Date | null;
  lastRun: Pick<DataMartRunItem, 'status' | 'id'> | null;
  createdById: string;
  createdAt: Date;
  modifiedAt: Date;
}
