import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  ParseEnumPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthContext, AuthorizationContext, Auth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { ReportMapper } from '../mappers/report.mapper';
import { CreateReportRequestApiDto } from '../dto/presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../dto/presentation/update-report-request-api.dto';
import { ReportResponseApiDto } from '../dto/presentation/report-response-api.dto';
import { CreateReportService } from '../use-cases/create-report.service';
import { GetReportService } from '../use-cases/get-report.service';
import { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import { ListReportsByProjectService } from '../use-cases/list-reports-by-project.service';
import { ListReportsByInsightTemplateService } from '../use-cases/list-reports-by-insight-template.service';
import { DeleteReportService } from '../use-cases/delete-report.service';
import { RunReportService } from '../use-cases/run-report.service';
import { UpdateReportService } from '../use-cases/update-report.service';
import { GetReportGeneratedSqlService } from '../use-cases/get-report-generated-sql.service';
import { CopyReportAsDataMartService } from '../use-cases/copy-report-as-data-mart.service';
import {
  CreateReportSpec,
  GetReportSpec,
  ListReportsByDataMartSpec,
  ListReportsByProjectSpec,
  DeleteReportSpec,
  RunReportSpec,
  UpdateReportSpec,
  ListReportsByInsightTemplateSpec,
  GetReportGeneratedSqlSpec,
  CopyReportAsDataMartSpec,
} from './spec/report.api';
import { RunType } from '../../common/scheduler/shared/types';
import { OwnerFilter } from '../enums/owner-filter.enum';

@Controller('reports')
@ApiTags('Reports')
export class ReportController {
  constructor(
    private readonly createReportService: CreateReportService,
    private readonly getReportService: GetReportService,
    private readonly listReportsByDataMartService: ListReportsByDataMartService,
    private readonly listReportsByProjectService: ListReportsByProjectService,
    private readonly listReportsByInsightTemplateService: ListReportsByInsightTemplateService,
    private readonly deleteReportService: DeleteReportService,
    private readonly runReportService: RunReportService,
    private readonly updateReportService: UpdateReportService,
    private readonly getReportGeneratedSqlService: GetReportGeneratedSqlService,
    private readonly copyReportAsDataMartService: CopyReportAsDataMartService,
    private readonly mapper: ReportMapper
  ) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post()
  @CreateReportSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateReportRequestApiDto
  ): Promise<ReportResponseApiDto> {
    const command = this.mapper.toCreateDomainCommand(context, dto);
    const report = await this.createReportService.run(command);
    return this.mapper.toResponse(report);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @GetReportSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<ReportResponseApiDto> {
    const command = this.mapper.toGetCommand(id, context);
    const report = await this.getReportService.run(command);
    return this.mapper.toResponse(report);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('data-mart/:dataMartId')
  @ListReportsByDataMartSpec()
  async listByDataMart(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<ReportResponseApiDto[]> {
    const command = this.mapper.toListByDataMartCommand(dataMartId, context);
    const reports = await this.listReportsByDataMartService.run(command);
    return this.mapper.toResponseList(reports);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('data-mart/:dataMartId/insight-template/:insightTemplateId')
  @ListReportsByInsightTemplateSpec()
  async listByInsightTemplate(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('insightTemplateId') insightTemplateId: string
  ): Promise<ReportResponseApiDto[]> {
    const command = this.mapper.toListByInsightTemplateCommand(
      dataMartId,
      insightTemplateId,
      context
    );
    const reports = await this.listReportsByInsightTemplateService.run(command);
    return this.mapper.toResponseList(reports);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListReportsByProjectSpec()
  async listByProject(
    @AuthContext() context: AuthorizationContext,
    @Query('ownerFilter', new ParseEnumPipe(OwnerFilter, { optional: true }))
    ownerFilter?: OwnerFilter
  ): Promise<ReportResponseApiDto[]> {
    const command = this.mapper.toListByProjectCommand(context, ownerFilter);
    const reports = await this.listReportsByProjectService.run(command);
    return this.mapper.toResponseList(reports);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteReportSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(id, context);
    await this.deleteReportService.run(command);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post(':id/run')
  @RunReportSpec()
  async runReport(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toRunReportCommand(id, context, RunType.manual);
    await this.runReportService.run(command);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id')
  @UpdateReportSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateReportRequestApiDto
  ): Promise<ReportResponseApiDto> {
    const command = this.mapper.toUpdateDomainCommand(id, context, dto);
    const report = await this.updateReportService.run(command);
    return this.mapper.toResponse(report);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id/generated-sql')
  @GetReportGeneratedSqlSpec()
  async getGeneratedSql(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<{ sql: string }> {
    const command = this.mapper.toGetGeneratedSqlCommand(id, context);
    return this.getReportGeneratedSqlService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':id/copy-as-data-mart')
  @CopyReportAsDataMartSpec()
  async copyAsDataMart(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<{ dataMartId: string }> {
    const command = this.mapper.toCopyAsDataMartCommand(id, context);
    const dataMart = await this.copyReportAsDataMartService.run(command);
    return { dataMartId: dataMart.id };
  }
}
