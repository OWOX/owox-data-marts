import { Injectable } from '@nestjs/common';
import { Report } from '../entities/report.entity';
import { ReportDto } from '../dto/domain/report.dto';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { UpdateReportCommand } from '../dto/domain/update-report.command';
import { CreateReportRequestApiDto } from '../dto/presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../dto/presentation/update-report-request-api.dto';
import { ReportResponseApiDto } from '../dto/presentation/report-response-api.dto';
import { GetReportCommand } from '../dto/domain/get-report.command';
import { DeleteReportCommand } from '../dto/domain/delete-report.command';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ListReportsByProjectCommand } from '../dto/domain/list-reports-by-project.command';
import { ListReportsByInsightTemplateCommand } from '../dto/domain/list-reports-by-insight-template.command';
import { ManualRunReportCommand } from '../dto/domain/run-report.command';
import { CopyReportAsDataMartCommand } from '../dto/domain/copy-report-as-data-mart.command';
import { GetReportGeneratedSqlCommand } from '../dto/domain/get-report-generated-sql.command';
import { AuthorizationContext } from '../../idp';
import { DataMartMapper } from './data-mart.mapper';
import { DataDestinationMapper } from './data-destination.mapper';
import { RunType } from '../../common/scheduler/shared/types';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';

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
      dto.destinationConfig,
      dto.ownerIds,
      context.roles ?? [],
      dto.columnConfig,
      dto.filterConfig ?? null,
      dto.sortConfig ?? null,
      dto.limitConfig ?? null
    );
  }

  toDomainDto(
    entity: Report,
    createdByUser: UserProjectionDto | null = null,
    ownerUsers: UserProjectionDto[] = [],
    capabilities: { canRun: boolean; canManageTriggers: boolean; canEditConfig: boolean } = {
      canRun: false,
      canManageTriggers: false,
      canEditConfig: false,
    }
  ): ReportDto {
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
      entity.runsCount,
      createdByUser,
      ownerUsers,
      entity.columnConfig,
      entity.filterConfig ?? null,
      entity.sortConfig ?? null,
      entity.limitConfig ?? null,
      capabilities.canRun,
      capabilities.canManageTriggers,
      capabilities.canEditConfig
    );
  }

  async toResponse(dto: ReportDto): Promise<ReportResponseApiDto> {
    return {
      id: dto.id,
      title: dto.title,
      dataMart: await this.dataMartMapper.toResponse(dto.dataMart),
      dataDestinationAccess: await this.dataDestinationMapper.toApiResponse(
        dto.dataDestinationAccess
      ),
      destinationConfig: dto.destinationConfig,
      columnConfig: dto.columnConfig,
      filterConfig: dto.filterConfig ?? null,
      sortConfig: dto.sortConfig ?? null,
      limitConfig: dto.limitConfig ?? null,
      lastRunAt: dto.lastRunAt,
      lastRunStatus: dto.lastRunStatus,
      lastRunError: dto.lastRunError,
      runsCount: dto.runsCount,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers,
      canRun: dto.canRun,
      canManageTriggers: dto.canManageTriggers,
      canEditConfig: dto.canEditConfig,
    };
  }

  async toResponseList(dtos: ReportDto[]): Promise<ReportResponseApiDto[]> {
    return Promise.all(dtos.map(dto => this.toResponse(dto)));
  }

  toGetCommand(id: string, context: AuthorizationContext): GetReportCommand {
    return new GetReportCommand(id, context.projectId, context.userId, context.roles ?? []);
  }

  toDeleteCommand(id: string, context: AuthorizationContext): DeleteReportCommand {
    return new DeleteReportCommand(id, context.projectId, context.userId, context.roles ?? []);
  }

  toListByDataMartCommand(
    dataMartId: string,
    context: AuthorizationContext
  ): ListReportsByDataMartCommand {
    return new ListReportsByDataMartCommand(
      dataMartId,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toListByInsightTemplateCommand(
    dataMartId: string,
    insightTemplateId: string,
    context: AuthorizationContext
  ): ListReportsByInsightTemplateCommand {
    return new ListReportsByInsightTemplateCommand(
      dataMartId,
      insightTemplateId,
      context.projectId,
      context.userId,
      context.roles ?? []
    );
  }

  toListByProjectCommand(
    context: AuthorizationContext,
    ownerFilter?: OwnerFilter,
    limit?: number,
    offset?: number
  ): ListReportsByProjectCommand {
    return new ListReportsByProjectCommand(
      context.projectId,
      context.userId,
      context.roles ?? [],
      ownerFilter,
      limit,
      offset
    );
  }

  toManualRunReportCommand(id: string, context: AuthorizationContext): ManualRunReportCommand {
    return {
      reportId: id,
      userId: context.userId,
      roles: context.roles ?? [],
      runType: RunType.manual,
      projectId: context.projectId,
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
      context.userId,
      context.roles ?? [],
      dto.title,
      dto.dataDestinationId,
      dto.destinationConfig,
      dto.ownerIds,
      dto.columnConfig,
      dto.filterConfig ?? null,
      dto.sortConfig ?? null,
      dto.limitConfig ?? null
    );
  }

  toCopyAsDataMartCommand(
    reportId: string,
    context: AuthorizationContext
  ): CopyReportAsDataMartCommand {
    return new CopyReportAsDataMartCommand(
      reportId,
      context.userId,
      context.projectId,
      context.roles ?? []
    );
  }

  toGetGeneratedSqlCommand(
    reportId: string,
    context: AuthorizationContext
  ): GetReportGeneratedSqlCommand {
    return new GetReportGeneratedSqlCommand(
      reportId,
      context.userId,
      context.projectId,
      context.roles ?? []
    );
  }
}
