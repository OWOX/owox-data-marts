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
 * config — the same `resolveReportDataHeaders` path a run uses — and opens no storage reader:
 * `prepareReportData` starts a warehouse query on some storages, and describing a report is a read
 * under `Role.viewer`.
 *
 * `ReportSqlComposerService.compose` is avoided for the same reason: it resolves the main table
 * reference, which for a SQL-defined Data Mart runs `CREATE OR REPLACE VIEW`. That leaves ONE
 * warehouse write still reachable from here — a BLENDED report, where
 * `resolveBlendingDecision` resolves table references itself on its way to the joined SQL, which
 * this service needs for `blendedDataHeaders` and `uniqueCountSources`. Closing that one needs a
 * headers-only mode on `resolveBlendingDecision`; until then a blended report on a SQL-defined
 * Data Mart still refreshes its view when its schema is described.
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

    // Ahead of the blending decision, not just ahead of the header build: without a stored schema
    // this request can only end in the exception below, and the decision is the one step here that
    // still writes — it refreshes a SQL-defined source's view on the joined path. Failing first
    // keeps a doomed request from touching the warehouse at all.
    if (!report.dataMart.schema) {
      throw new BusinessViolationException('Data mart schema must be provided');
    }

    const accessor = { userId: command.userId, roles: command.roles };
    const decision = await this.blendedReportDataService.resolveBlendingDecision(report, accessor);

    // Calculated fields are named by their formula and exist only in the plan that built them.
    //
    // Built directly rather than through `compose`: composing resolves the main table reference,
    // and for a SQL-defined Data Mart that runs `CREATE OR REPLACE VIEW` against the customer's
    // warehouse — DDL a describe endpoint under `Role.viewer` must not issue. The plans are the
    // same ones `compose` derives before it ever reaches that step, so nothing about the headers
    // changes; what goes away is the warehouse write, a second `resolveBlendingDecision`, and the
    // SQL-composition errors that used to fail a request that only ever needed to name columns.
    let calculatedFields: CalculatedFieldPlan[] | undefined;
    if (decision.needsBlending) {
      calculatedFields = decision.calculatedFields;
    } else if (hasOutputControls(report)) {
      const plans = this.reportSqlComposerService.buildCalculatedFieldPlans(
        report.dataMart.schema.fields ?? [],
        decision.columnFilter ?? [],
        report.aggregationConfig ?? undefined
      );
      calculatedFields = plans.length > 0 ? plans : undefined;
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
