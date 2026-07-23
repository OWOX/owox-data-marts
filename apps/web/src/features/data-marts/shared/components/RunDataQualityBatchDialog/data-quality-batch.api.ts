import { ApiService } from '../../../../../services';

export const DATA_QUALITY_BATCH_LIMIT = 200;

export type DataQualityBatchErrorCode =
  | 'NOT_FOUND_OR_FORBIDDEN'
  | 'NOT_ELIGIBLE'
  | 'ACTIVE_RUN'
  | 'INVALID_CONFIG'
  | 'INTERNAL_ERROR';

export type DataQualityBatchRunItem =
  | { dataMartId: string; status: 'SUCCESS'; runId: string }
  | {
      dataMartId: string;
      status: 'ERROR';
      code: DataQualityBatchErrorCode;
      message: string;
      activeRunId?: string | null;
    };

export interface DataQualityBatchRunResponse {
  items: DataQualityBatchRunItem[];
}

class DataQualityBatchApi extends ApiService {
  constructor() {
    super('/data-marts/data-quality');
  }

  run(dataMartIds: string[]): Promise<DataQualityBatchRunResponse> {
    return this.post<DataQualityBatchRunResponse>('/runs/batch', { dataMartIds });
  }
}

export const dataQualityBatchApi = new DataQualityBatchApi();
