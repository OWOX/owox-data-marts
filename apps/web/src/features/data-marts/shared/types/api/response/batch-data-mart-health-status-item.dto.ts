import type { DataMartRunResponseDto } from './data-mart-run.response.dto';

export interface BatchDataMartHealthStatusItemDto {
  dataMartId: string;
  connector: DataMartRunResponseDto | null;
  report: DataMartRunResponseDto | null;
  insight: DataMartRunResponseDto | null;
}
