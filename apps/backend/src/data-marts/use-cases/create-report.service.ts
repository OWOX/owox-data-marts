import { IsNull, Not, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { Report } from '../entities/report.entity';
import { ReportCreatedEvent } from '../events/report-created.event';
import { ReportMapper } from '../mappers/report.mapper';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { ReportDto } from '../dto/domain/report.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataDestinationAccessValidatorFacade } from '../data-destination-types/facades/data-destination-access-validator.facade';
import { DataMartService } from '../services/data-mart.service';
import { DataDestinationService } from '../services/data-destination.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ReportOwner } from '../entities/report-owner.entity';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ForbiddenException } from '@nestjs/common';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import { ReportAccessService } from '../services/report-access.service';
import { foldEmptyUniqueCountConfig } from '../dto/schemas/unique-count-sources';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

@Injectable()
export class CreateReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(ReportOwner)
    private readonly reportOwnerRepository: Repository<ReportOwner>,
    private readonly dataMartService: DataMartService,
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationAccessValidationFacade: DataDestinationAccessValidatorFacade,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly outputControlsValidator: OutputControlsValidatorService,
    private readonly reportAccessService: ReportAccessService
  ) {}

  @Transactional()
  async run(command: CreateReportCommand): Promise<ReportDto> {
    // Get the data mart and verify it's in published status
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException(
        `Cannot create report for data mart with status ${dataMart.status}. Data mart must be in PUBLISHED status.`
      );
    }

    // Permissions Model: verify user has reporting access to this DataMart
    if (command.userId) {
      const canUseDm = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.dataMartId,
        Action.USE,
        command.projectId
      );
      if (!canUseDm) {
        throw new ForbiddenException('You do not have access to the DataMart for this report');
      }
    }

    // Permissions Model: verify user has access to this Destination
    if (command.userId) {
      const canUseDest = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DESTINATION,
        command.dataDestinationId,
        Action.USE,
        command.projectId
      );
      if (!canUseDest) {
        throw new ForbiddenException('You do not have access to the Destination for this report');
      }
    }

    // Get the data destination
    const dataDestination = await this.dataDestinationService.getByIdAndProjectId(
      command.dataDestinationId,
      command.projectId
    );

    await this.dataDestinationAccessValidationFacade.checkAccess(
      dataDestination.type,
      command.destinationConfig,
      dataDestination
    );

    let existingReport: Report | null = null;
    if (dataDestination.type === DataDestinationType.LOOKER_STUDIO) {
      existingReport = await this.reportRepository.findOne({
        where: {
          dataMart: { id: dataMart.id, projectId: command.projectId },
          dataDestination: { id: dataDestination.id },
        },
        withDeleted: true,
      });

      if (existingReport && !existingReport.deletedAt) {
        throw new BusinessViolationException(
          'A Looker Studio report already exists for this data mart and destination.'
        );
      }
    }

    await this.outputControlsValidator.validateForReport({
      storageType: dataMart.storage.type,
      dataMartId: dataMart.id,
      projectId: command.projectId,
      columnConfig: command.columnConfig ?? null,
      filterConfig: command.filterConfig ?? null,
      sortConfig: command.sortConfig ?? null,
      limitConfig: command.limitConfig ?? null,
      aggregationConfig: command.aggregationConfig ?? null,
      dateTruncConfig: command.dateTruncConfig ?? null,
      uniqueCountConfig: foldEmptyUniqueCountConfig(command.uniqueCountConfig),
      accessor: { userId: command.userId, roles: command.roles },
      dataMartSchemaFields: dataMart.schema?.fields,
      rejectUnavailableUniqueCountSources: true,
    });

    // Re-enabling uses the same settings and permissions as creating a new connection.
    const reportConfig = {
      createdById: command.userId,
      destinationConfig: command.destinationConfig,
      columnConfig: command.columnConfig ?? null,
      filterConfig: command.filterConfig ?? null,
      sortConfig: command.sortConfig ?? null,
      limitConfig: command.limitConfig ?? null,
      aggregationConfig: command.aggregationConfig ?? null,
      dateTruncConfig: command.dateTruncConfig ?? null,
      uniqueCountConfig: foldEmptyUniqueCountConfig(command.uniqueCountConfig),
    };

    let newReport: Report;
    if (existingReport) {
      const restored = await this.reportRepository.restore({
        id: existingReport.id,
        deletedAt: Not(IsNull()),
      });
      if (!restored.affected) {
        throw new BusinessViolationException('This Looker Studio report has already been enabled.');
      }
      // Looker reads as the new caller; preserve the ID, creation date and run history.
      await this.reportRepository.update(existingReport.id, { ...reportConfig, title: '' });
      newReport = await this.reportRepository.findOneByOrFail({ id: existingReport.id });
    } else {
      const report = this.reportRepository.create({
        ...reportConfig,
        title: command.title,
        dataMart,
        dataDestination,
      });
      newReport = await this.reportRepository.save(report);
    }

    const ownerIdsToSave = command.ownerIds ?? [command.userId];
    await syncOwners(
      this.reportOwnerRepository,
      'reportId',
      newReport.id,
      command.projectId,
      ownerIdsToSave,
      this.idpProjectionsFacade,
      userId => {
        const o = new ReportOwner();
        o.reportId = newReport.id;
        o.userId = userId;
        return o;
      }
    );

    newReport.owners = ownerIdsToSave.map(uid => {
      const o = new ReportOwner();
      o.reportId = newReport.id;
      o.userId = uid;
      return o;
    });

    if (!existingReport) {
      const reportCreatedEvent = new ReportCreatedEvent(
        newReport.id,
        dataMart.id,
        command.projectId,
        dataDestination.type,
        command.userId
      );
      await this.eventDispatcher.publishOnCommit(reportCreatedEvent);
    }

    const allUserIds = [newReport.createdById, ...newReport.ownerIds];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = userProjections.getByUserId(newReport.createdById) ?? null;

    const capabilities = await this.reportAccessService.computeCapabilitiesForReport(
      command.userId,
      command.roles,
      newReport,
      command.projectId
    );

    return this.mapper.toDomainDto(
      newReport,
      createdByUser,
      resolveOwnerUsers(newReport.ownerIds, userProjections),
      capabilities
    );
  }
}
