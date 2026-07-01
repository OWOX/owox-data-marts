import type {
  DataMartRunResponseDto,
  ProjectDataMartRunResponseDto,
} from './data-mart-run.response.dto';

export interface DataMartRunListResponseDto {
  runs: DataMartRunResponseDto[];
}

export interface ProjectDataMartRunListResponseDto {
  runs: ProjectDataMartRunResponseDto[];
}
