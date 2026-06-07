import { Controller, Get, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { ReportResponseApiDto } from '../dto/presentation/report-response-api.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { ReportMapper } from '../mappers/report.mapper';
import { ListReportsByProjectService } from '../use-cases/list-reports-by-project.service';
import { normalizeProjectListPagination } from '../utils/normalize-project-list-pagination';
import { ListReportsByProjectSpec } from './spec/project-reports.api';

@Controller('reports')
@ApiTags('Reports')
export class ProjectReportsController {
  constructor(
    private readonly listReportsByProjectService: ListReportsByProjectService,
    private readonly mapper: ReportMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListReportsByProjectSpec()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('limit') limit?: string | number,
    @Query('offset') offset?: string | number,
    @Query('ownerFilter', new ParseEnumPipe(OwnerFilter, { optional: true }))
    ownerFilter?: OwnerFilter
  ): Promise<ReportResponseApiDto[]> {
    const pagination =
      limit === undefined && offset === undefined
        ? null
        : normalizeProjectListPagination(limit, offset);
    const command = this.mapper.toListByProjectCommand(
      context,
      ownerFilter,
      pagination?.limit,
      pagination?.offset
    );
    const reports = await this.listReportsByProjectService.run(command);
    return this.mapper.toResponseList(reports);
  }
}
