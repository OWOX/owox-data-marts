import { Injectable } from '@nestjs/common';
import { Report } from '../entities/report.entity';
import { ReportDto } from '../dto/domain/report.dto';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { UpdateReportCommand } from '../dto/domain/update-report.command';
import { CreateReportRequestApiDto } from '../dto/presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../dto/presentation/update-report-request-api.dto';
import { ReportResponseApiDto } from '../dto/presentation/report-response-api.dto';
import { GetReportCommand } from '../dto/domain/get-report.command';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ListReportsByProjectCommand } from '../dto/domain/list-reports-by-project.command';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { AuthorizationContext } from '../../idp';
import { DataMartMapper } from './data-mart.mapper';
import { DataDestinationMapper } from './data-destination.mapper';

@Injectable()
export class ReportMapper {
  constructor(
    private readonly dataMartMapper: DataMartMapper,
    private readonly dataDestinationMapper: DataDestinationMapper
  ) {}

  toCreateDomainCommand(
    context: AuthorizationContext,
    dto: CreateReportRequestApiDto
  ): CreateReportCommand {
    return new CreateReportCommand(
      context.projectId,
      context.userId,
      dto.title,
      dto.dataMartId,
      dto.dataDestinationId,
      dto.destinationConfig
    );
  }

  toDomainDto(entity: Report): ReportDto {
    return new ReportDto(
      entity.id,
      entity.title,
      this.dataMartMapper.toDomainDto(entity.dataMart),
      this.dataDestinationMapper.toDomainDto(entity.dataDestination),
      entity.destinationConfig,
      entity.createdAt,
      entity.modifiedAt,
      entity.lastRunAt,
      entity.lastRunError,
      entity.lastRunStatus,
      entity.runsCount
    );
  }

  toDomainDtoList(entities: Report[]): ReportDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  async toResponse(dto: ReportDto): Promise<ReportResponseApiDto> {
    return {
      id: dto.id,
      title: dto.title,
      dataMart: await this.dataMartMapper.toResponse(dto.dataMart),
      dataDestinationAccess: this.dataDestinationMapper.toApiResponse(dto.dataDestinationAccess),
      destinationConfig: dto.destinationConfig,
      lastRunAt: dto.lastRunAt,
      lastRunStatus: dto.lastRunStatus,
      lastRunError: dto.lastRunError,
      runsCount: dto.runsCount,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  async toResponseList(dtos: ReportDto[]): Promise<ReportResponseApiDto[]> {
    return Promise.all(dtos.map(dto => this.toResponse(dto)));
  }

  toGetCommand(id: string, context: AuthorizationContext): GetReportCommand {
    return new GetReportCommand(id, context.projectId);
  }

  toListByDataMartCommand(
    dataMartId: string,
    context: AuthorizationContext
  ): ListReportsByDataMartCommand {
    return new ListReportsByDataMartCommand(dataMartId, context.projectId);
  }

  toListByProjectCommand(context: AuthorizationContext): ListReportsByProjectCommand {
    return new ListReportsByProjectCommand(context.projectId);
  }

  toRunReportCommand(id: string, context: AuthorizationContext): RunReportCommand {
    return {
      reportId: id,
      userId: context.userId,
    };
  }

  toUpdateDomainCommand(
    id: string,
    context: AuthorizationContext,
    dto: UpdateReportRequestApiDto
  ): UpdateReportCommand {
    return new UpdateReportCommand(
      id,
      context.projectId,
      dto.title,
      dto.dataDestinationId,
      dto.destinationConfig
    );
  }
}
