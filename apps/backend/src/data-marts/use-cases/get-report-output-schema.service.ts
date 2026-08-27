import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { columnFilterWithoutCalculatedFields } from '../calculated-fields/calculated-field.utils';
import { ReportHeadersGeneratorFacade } from '../data-storage-types/facades/report-headers-generator.facade';
import { resolveReportDataHeaders } from '../data-storage-types/utils/report-data-headers.utils';
import { CalculatedFieldPlan } from '../data-storage-types/utils/sql-clause-renderer';
import { GetReportOutputSchemaCommand } from '../dto/domain/get-report-output-schema.command';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { hasOutputControls } from '../dto/domain/report-like-read-plan';
import { hasMainUniqueCount } from '../dto/schemas/unique-count-sources';
import { Report } from '../entities/report.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';

/**
 * The columns a report's rows will carry. Headers come from the stored schema plus the report
 * config — the same `resolveReportDataHeaders` path a run uses — and must not open a storage
 * reader: `prepareReportData` starts a warehouse query on some storages.
 */
@Injectable()
export class GetReportOutputSchemaService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly reportHeadersGeneratorFacade: ReportHeadersGeneratorFacade
  ) {}

  async run(command: GetReportOutputSchemaCommand): Promise<ReportDataHeader[]> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const report = await this.reportRepository.findOne({
      where: {
        id: command.reportId,
        dataMart: { projectId: command.projectId },
      },
      relations: ['dataMart', 'dataMart.storage', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${command.reportId} not found`);
    }

    // Same rule as the generated-SQL preview: describing a report is transparency, not a
    // maintenance privilege. Access to joined sources is enforced by the blending decision.
    const canSeeDataMart = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      report.dataMart.id,
      Action.SEE,
      command.projectId
    );
    if (!canSeeDataMart) {
      throw new ForbiddenException(
        'You do not have permission to view the output schema of this report: access to the source data mart is required.'
      );
    }

    const accessor = { userId: command.userId, roles: command.roles };
    const decision = await this.blendedReportDataService.resolveBlendingDecision(report, accessor);

    // Calculated fields are named by their formula and exist only in the plan that built them.
    let calculatedFields: CalculatedFieldPlan[] | undefined;
    if (decision.needsBlending) {
      calculatedFields = decision.calculatedFields;
    } else if (hasOutputControls(report)) {
      calculatedFields = (await this.reportSqlComposerService.compose(report, accessor))
        .calculatedFields;
    }

    if (!report.dataMart.schema) {
      throw new BusinessViolationException('Data mart schema must be provided');
    }

    const nativeHeaders = await this.reportHeadersGeneratorFacade.generateHeadersFromSchema(
      report.dataMart.storage.type,
      report.dataMart.schema
    );

    return resolveReportDataHeaders(
      nativeHeaders,
      {
        columnFilter: columnFilterWithoutCalculatedFields(decision.columnFilter, calculatedFields),
        blendedDataHeaders: decision.blendedDataHeaders,
        aggregationConfig: decision.aggregations ?? report.aggregationConfig ?? undefined,
        uniqueCount: hasMainUniqueCount(report.uniqueCountConfig),
        primaryKeyColumns: decision.primaryKeyColumns,
        uniqueCountSources: decision.uniqueCountSources,
        calculatedFields,
      },
      report.dataMart.storage.type
    );
  }
}
