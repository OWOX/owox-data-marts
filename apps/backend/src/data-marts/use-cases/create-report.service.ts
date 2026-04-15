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
    private readonly eventDispatcher: OwoxEventDispatcher
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

    // Get the data destination
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

    // Create and save the report
    const report = this.reportRepository.create({
      title: command.title,
      dataMart,
      dataDestination,
      createdById: command.userId,
      destinationConfig: command.destinationConfig,
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

    return this.mapper.toDomainDto(
      newReport,
      createdByUser,
      resolveOwnerUsers(ownerIdsToSave, userProjections)
    );
  }
}
