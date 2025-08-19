import type {
  DataMartRunDto,
  DataMartRunItemDto,
  DataMartRun,
  DataMartRunItem,
} from '../types/data-mart-run';
import { RunStatus } from '../../components/DataMartRunHistoryView/types';

export const mapDataMartRunItemDtoToEntity = (dto: DataMartRunItemDto): DataMartRunItem => ({
  id: dto.id,
  status: dto.status as RunStatus,
  createdAt: new Date(dto.createdAt),
  logs: dto.logs,
  errors: dto.errors,
  definitionRun: dto.definitionRun,
});

export const mapDataMartRunDtoToEntity = (dto: DataMartRunDto): DataMartRun => ({
  runs: dto.runs.map(mapDataMartRunItemDtoToEntity),
});

export const mapDataMartRunItemEntityToDto = (entity: DataMartRunItem): DataMartRunItemDto => ({
  id: entity.id,
  status: entity.status,
  createdAt: entity.createdAt.toISOString(),
  logs: entity.logs,
  errors: entity.errors,
  definitionRun: entity.definitionRun,
});

export const mapDataMartRunEntityToDto = (entity: DataMartRun): DataMartRunDto => ({
  runs: entity.runs.map(mapDataMartRunItemEntityToDto),
});
