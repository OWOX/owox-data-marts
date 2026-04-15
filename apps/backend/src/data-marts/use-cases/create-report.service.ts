import { Repository } from 'typeorm';
import { Transactional, runOnTransactionCommit } from 'typeorm-transactional';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OwoxProducer } from '@owox/internal-helpers';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly eventEmitter: EventEmitter2,
    private readonly accessDecisionService: AccessDecisionService
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

    await this.producer.produceEvent(reportCreatedEvent);
    runOnTransactionCommit(() => {
      this.eventEmitter.emit('report.created', reportCreatedEvent);
    });

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
