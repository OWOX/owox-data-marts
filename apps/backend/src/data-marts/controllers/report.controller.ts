import { Controller, Get, Post, Put, Body, Param, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthContext,
  AuthorizationContext,
} from '../../common/authorization-context/authorization.context';
import { ReportMapper } from '../mappers/report.mapper';
import { CreateReportRequestApiDto } from '../dto/presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../dto/presentation/update-report-request-api.dto';
import { ReportResponseApiDto } from '../dto/presentation/report-response-api.dto';
import { CreateReportService } from '../use-cases/create-report.service';
import { GetReportService } from '../use-cases/get-report.service';
import { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import { ListReportsByProjectService } from '../use-cases/list-reports-by-project.service';
import { DeleteReportService } from '../use-cases/delete-report.service';
import { RunReportService } from '../use-cases/run-report.service';
import { UpdateReportService } from '../use-cases/update-report.service';
import {
  CreateReportSpec,
  GetReportSpec,
  ListReportsByDataMartSpec,
  ListReportsByProjectSpec,
  DeleteReportSpec,
  RunReportSpec,
  UpdateReportSpec,
} from './spec/report.api';

@Controller('reports')
@ApiTags('Reports')
export class ReportController {
  constructor(
    private readonly createReportService: CreateReportService,
    private readonly getReportService: GetReportService,
    private readonly listReportsByDataMartService: ListReportsByDataMartService,
    private readonly listReportsByProjectService: ListReportsByProjectService,
    private readonly deleteReportService: DeleteReportService,
    private readonly runReportService: RunReportService,
    private readonly updateReportService: UpdateReportService,
    private readonly mapper: ReportMapper
  ) {}

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

  @Get()
  @ListReportsByProjectSpec()
  async listByProject(
    @AuthContext() context: AuthorizationContext
  ): Promise<ReportResponseApiDto[]> {
    const command = this.mapper.toListByProjectCommand(context);
    const reports = await this.listReportsByProjectService.run(command);
    return this.mapper.toResponseList(reports);
  }

  @Delete(':id')
  @DeleteReportSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toGetCommand(id, context);
    await this.deleteReportService.run(command);
  }

  @Post(':id/run')
  @RunReportSpec()
  async runReport(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toRunReportCommand(id, context);
    this.runReportService.runInBackground(command);
  }

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
}
