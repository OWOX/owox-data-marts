import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
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
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { createDataMartUseAccessFilter } from '../utils/create-dm-access-filter';

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
    private readonly availableDestinationTypesService: AvailableDestinationTypesService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly outputControlsValidator: OutputControlsValidatorService,
    private readonly reportAccessService: ReportAccessService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  @Transactional()
  async run(command: CreateReportCommand): Promise<ReportDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException(
        `Cannot create report for data mart with status ${dataMart.status}. Data mart must be in PUBLISHED status.`
      );
    }

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

      if (
        command.columnConfig?.length ||
        command.filterConfig?.length ||
        command.sortConfig?.length
      ) {
        const accessFilter = createDataMartUseAccessFilter(
          this.accessDecisionService,
          command.userId,
          command.roles,
          command.projectId
        );
        await this.blendableSchemaService.assertNoInaccessibleReportRefs(
          {
            columnConfig: command.columnConfig,
            filterConfig: command.filterConfig,
            sortConfig: command.sortConfig,
          },
          command.dataMartId,
          command.projectId,
          accessFilter,
          'Cannot save report'
        );
      }
    }

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

    const dataDestination = await this.dataDestinationService.getByIdAndProjectId(
      command.dataDestinationId,
      command.projectId
    );

    this.availableDestinationTypesService.verifyIsAllowed(dataDestination.type);
    await this.dataDestinationAccessValidationFacade.checkAccess(
      dataDestination.type,
      command.destinationConfig,
      dataDestination
    );

    await this.outputControlsValidator.validateForReport({
      storageType: dataMart.storage.type,
      dataMartId: dataMart.id,
      projectId: command.projectId,
      columnConfig: command.columnConfig ?? null,
      filterConfig: command.filterConfig ?? null,
      sortConfig: command.sortConfig ?? null,
      limitConfig: command.limitConfig ?? null,
    });

    const report = this.reportRepository.create({
      title: command.title,
      dataMart,
      dataDestination,
      createdById: command.userId,
      destinationConfig: command.destinationConfig,
      columnConfig: command.columnConfig ?? null,
      filterConfig: command.filterConfig ?? null,
      sortConfig: command.sortConfig ?? null,
      limitConfig: command.limitConfig ?? null,
    });

    const newReport = await this.reportRepository.save(report);

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

    const reportCreatedEvent = new ReportCreatedEvent(
      newReport.id,
      dataMart.id,
      command.projectId,
      dataDestination.type,
      command.userId
    );

    await this.eventDispatcher.publishOnCommit(reportCreatedEvent);

    const allUserIds = [command.userId, ...ownerIdsToSave];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = userProjections.getByUserId(command.userId) ?? null;

    const capabilities = await this.reportAccessService.computeCapabilitiesForReport(
      command.userId,
      command.roles,
      newReport,
      command.projectId
    );

    return this.mapper.toDomainDto(
      newReport,
      createdByUser,
      resolveOwnerUsers(ownerIdsToSave, userProjections),
      capabilities
    );
  }
}
