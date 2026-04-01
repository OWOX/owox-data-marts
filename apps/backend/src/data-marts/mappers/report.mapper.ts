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
import { ListReportsByInsightTemplateCommand } from '../dto/domain/list-reports-by-insight-template.command';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { AuthorizationContext } from '../../idp';
import { DataMartMapper } from './data-mart.mapper';
import { DataDestinationMapper } from './data-destination.mapper';
import { RunType } from '../../common/scheduler/shared/types';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';

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

  toDomainDto(
    entity: Report,
    createdByUser: UserProjectionDto | null = null,
    ownerUsers: UserProjectionDto[] = []
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
      ownerUsers
    );
  }

  toDomainDtoList(entities: Report[], userProjectionsList?: UserProjectionsListDto): ReportDto[] {
    return entities.map(entity =>
      this.toDomainDto(
        entity,
        entity.createdById ? (userProjectionsList?.getByUserId(entity.createdById) ?? null) : null,
        userProjectionsList ? resolveOwnerUsers(entity.ownerIds, userProjectionsList) : []
      )
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
      lastRunAt: dto.lastRunAt,
      lastRunStatus: dto.lastRunStatus,
      lastRunError: dto.lastRunError,
      runsCount: dto.runsCount,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers,
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

  toListByInsightTemplateCommand(
    dataMartId: string,
    insightTemplateId: string,
    context: AuthorizationContext
  ): ListReportsByInsightTemplateCommand {
    return new ListReportsByInsightTemplateCommand(
      dataMartId,
      insightTemplateId,
      context.projectId
    );
  }

  toListByProjectCommand(
    context: AuthorizationContext,
    ownerFilter?: OwnerFilter
  ): ListReportsByProjectCommand {
    return new ListReportsByProjectCommand(context.projectId, ownerFilter);
  }

  toRunReportCommand(
    id: string,
    context: AuthorizationContext,
    runType: RunType
  ): RunReportCommand {
    return {
      reportId: id,
      userId: context.userId,
      runType,
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
      dto.destinationConfig,
      dto.ownerIds
    );
  }
}
