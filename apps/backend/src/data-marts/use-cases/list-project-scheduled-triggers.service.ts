import { Injectable } from '@nestjs/common';
import { ListProjectScheduledTriggersCommand } from '../dto/domain/list-project-scheduled-triggers.command';
import { ProjectScheduledTriggerDto } from '../dto/domain/project-scheduled-trigger.dto';
import { ReportMapper } from '../mappers/report.mapper';
import { RoleScope } from '../enums/role-scope.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';
import { isConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { ContextAccessService } from '../services/context/context-access.service';
import { ReportService } from '../services/report.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

const ScheduledConnectorRunConfigType = 'scheduled-connector-run-config';

@Injectable()
export class ListProjectScheduledTriggersService {
  constructor(
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly contextAccessService: ContextAccessService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: ScheduledTriggerMapper,
    private readonly reportService: ReportService,
    private readonly reportMapper: ReportMapper,
    private readonly connectorSecretService: ConnectorSecretService
  ) {}

  async run(command: ListProjectScheduledTriggersCommand): Promise<ProjectScheduledTriggerDto[]> {
    const isAdmin = command.roles.includes('admin');
    const roleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    const triggers = await this.scheduledTriggerService.listVisibleByProject({
      projectId: command.projectId,
      userId: command.userId,
      roles: command.roles,
      roleScope,
      limit: command.limit,
      offset: command.offset,
    });

    const userProjections =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(triggers);

    const triggersWithRunTargets = await this.enrichRunTargets(triggers, command.projectId);

    return triggersWithRunTargets.map(trigger => {
      const createdByUser = trigger.createdById
        ? (userProjections.getByUserId(trigger.createdById) ?? null)
        : null;

      return new ProjectScheduledTriggerDto(this.mapper.toDomainDto(trigger, createdByUser), {
        id: trigger.dataMart.id,
        title: trigger.dataMart.title,
      });
    });
  }

  private async enrichRunTargets(
    triggers: DataMartScheduledTrigger[],
    projectId: string
  ): Promise<DataMartScheduledTrigger[]> {
    const reportIds = [
      ...new Set(
        triggers
          .filter(trigger => trigger.type === ScheduledTriggerType.REPORT_RUN)
          .map(trigger => trigger.triggerConfig?.reportId)
          .filter((reportId): reportId is string => Boolean(reportId))
      ),
    ];

    const dataMartIds = [...new Set(triggers.map(trigger => trigger.dataMart.id).filter(Boolean))];
    const reports = await this.reportService.getByIdsAndProjectIdAndDataMartIds(
      reportIds,
      projectId,
      dataMartIds
    );
    const reportResponseEntries = await Promise.all(
      reports.map(async report => {
        const reportDto = this.reportMapper.toDomainDto(report);
        const reportResponse = await this.reportMapper.toResponse(reportDto);
        return [report.id, reportResponse] as const;
      })
    );
    const reportResponseById = new Map(reportResponseEntries);

    return Promise.all(
      triggers.map(async trigger => {
        if (trigger.type === ScheduledTriggerType.REPORT_RUN) {
          const reportId = trigger.triggerConfig?.reportId;
          const reportResponse = reportId ? reportResponseById.get(reportId) : undefined;

          if (!reportId || !reportResponse) {
            return trigger;
          }

          return this.cloneTriggerWithConfig(trigger, {
            type: ScheduledReportRunConfigType,
            reportId,
            report: reportResponse,
          } as unknown as DataMartScheduledTrigger['triggerConfig']);
        }

        if (
          trigger.type === ScheduledTriggerType.CONNECTOR_RUN &&
          trigger.dataMart.definition &&
          isConnectorDefinition(trigger.dataMart.definition)
        ) {
          const maskedDefinition = await this.connectorSecretService.mask(
            trigger.dataMart.definition
          );

          return this.cloneTriggerWithConfig(trigger, {
            type: ScheduledConnectorRunConfigType,
            connector: maskedDefinition,
          } as unknown as DataMartScheduledTrigger['triggerConfig']);
        }

        return trigger;
      })
    );
  }

  private cloneTriggerWithConfig(
    trigger: DataMartScheduledTrigger,
    triggerConfig: DataMartScheduledTrigger['triggerConfig']
  ): DataMartScheduledTrigger {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(trigger)),
      trigger
    ) as DataMartScheduledTrigger;
    clone.triggerConfig = triggerConfig;
    return clone;
  }
}
