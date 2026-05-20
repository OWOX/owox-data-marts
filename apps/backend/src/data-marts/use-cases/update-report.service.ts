import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
import { Report } from '../entities/report.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { UpdateReportCommand } from '../dto/domain/update-report.command';
import { ReportDto } from '../dto/domain/report.dto';
import { DataDestinationAccessValidatorFacade } from '../data-destination-types/facades/data-destination-access-validator.facade';
import { DataDestinationService } from '../services/data-destination.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { ReportOwner } from '../entities/report-owner.entity';
import { resolveOwnerUsers } from '../utils/resolve-owner-users';
import { syncOwners } from '../utils/sync-owners';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { ReportAccessService } from '../services/report-access.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { createDataMartUseAccessFilter } from '../utils/create-dm-access-filter';

@Injectable()
export class UpdateReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationAccessValidationFacade: DataDestinationAccessValidatorFacade,
    private readonly mapper: ReportMapper,
    private readonly availableDestinationTypesService: AvailableDestinationTypesService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    @InjectRepository(ReportOwner)
    private readonly reportOwnerRepository: Repository<ReportOwner>,
    private readonly reportAccessService: ReportAccessService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly outputControlsValidator: OutputControlsValidatorService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly blendableSchemaService: BlendableSchemaService
  ) {}

  @Transactional()
  async run(command: UpdateReportCommand): Promise<ReportDto> {
    const report = await this.reportRepository.findOne({
      where: {
        id: command.id,
        dataMart: {
          projectId: command.projectId,
        },
      },
      relations: ['dataMart', 'dataDestination', 'owners'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${command.id} not found`);
    }

    await this.reportAccessService.checkMutateAccess(
      command.userId,
      command.roles,
      command.id,
      command.projectId
    );

    if (
      command.userId &&
      (command.columnConfig?.length || command.filterConfig?.length || command.sortConfig?.length)
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
        report.dataMart.id,
        command.projectId,
        accessFilter,
        'Cannot save report'
      );
    }

    let dataDestination: DataDestination = report.dataDestination;
    const destinationIsChanging = command.dataDestinationId !== dataDestination.id;
    if (destinationIsChanging) {
      dataDestination = await this.dataDestinationService.getByIdAndProjectId(
        command.dataDestinationId,
        command.projectId
      );

      if (command.userId) {
        const canUseNewDest = await this.accessDecisionService.canAccess(
          command.userId,
          command.roles,
          EntityType.DESTINATION,
          dataDestination.id,
          Action.USE,
          command.projectId
        );
        if (!canUseNewDest) {
          throw new ForbiddenException('You do not have access to the Destination for this report');
        }
      }
    }

    this.availableDestinationTypesService.verifyIsAllowed(dataDestination.type);

    await this.dataDestinationAccessValidationFacade.checkAccess(
      dataDestination.type,
      command.destinationConfig,
      dataDestination
    );

    if (command.ownerIds !== undefined) {
      for (const ownerId of command.ownerIds) {
        const canOwn = await this.reportAccessService.canBeOwner(
          ownerId,
          report,
          command.projectId
        );
        if (!canOwn) {
          throw new BadRequestException(
            `User ${ownerId} cannot be added as report owner — not a valid project member or lacks required access.`
          );
        }
      }
    }

    await this.outputControlsValidator.validateForReport({
      storageType: report.dataMart.storage.type,
      dataMartId: report.dataMart.id,
      projectId: report.dataMart.projectId,
      columnConfig: command.columnConfig ?? null,
      filterConfig: command.filterConfig ?? null,
      sortConfig: command.sortConfig ?? null,
      limitConfig: command.limitConfig ?? null,
    });

    // Column order is part of the report output, so a serialized compare is intentional —
    // reordering alone must rebuild the cached reader.
    const previousColumnConfig = report.columnConfig ?? null;
    const nextColumnConfig = command.columnConfig ?? null;
    const columnConfigChanged =
      JSON.stringify(previousColumnConfig) !== JSON.stringify(nextColumnConfig);

    const previousFilterConfig = report.filterConfig ?? null;
    const nextFilterConfig = command.filterConfig ?? null;
    const filterChanged = JSON.stringify(previousFilterConfig) !== JSON.stringify(nextFilterConfig);

    const previousSortConfig = report.sortConfig ?? null;
    const nextSortConfig = command.sortConfig ?? null;
    const sortChanged = JSON.stringify(previousSortConfig) !== JSON.stringify(nextSortConfig);

    const previousLimitConfig = report.limitConfig ?? null;
    const nextLimitConfig = command.limitConfig ?? null;
    const limitChanged = previousLimitConfig !== nextLimitConfig;

    report.title = command.title;
    report.dataDestination = dataDestination;
    report.destinationConfig = command.destinationConfig;
    report.columnConfig = nextColumnConfig;
    report.filterConfig = nextFilterConfig;
    report.sortConfig = nextSortConfig;
    report.limitConfig = nextLimitConfig;

    const updatedReport = await this.reportRepository.save(report);

    if (command.ownerIds !== undefined) {
      await syncOwners(
        this.reportOwnerRepository,
        'reportId',
        updatedReport.id,
        report.dataMart.projectId,
        command.ownerIds,
        this.idpProjectionsFacade,
        userId => {
          const o = new ReportOwner();
          o.reportId = updatedReport.id;
          o.userId = userId;
          return o;
        }
      );
    }

    if (columnConfigChanged || filterChanged || sortChanged || limitChanged) {
      await this.reportDataCacheService.invalidateByReportId(updatedReport.id);
    }

    const fresh = await this.reportRepository.findOne({
      where: { id: updatedReport.id },
      relations: ['dataMart', 'dataDestination', 'owners'],
    });

    if (!fresh) {
      throw new NotFoundException(`Report with ID ${updatedReport.id} not found`);
    }

    const allUserIds = [...(fresh.createdById ? [fresh.createdById] : []), ...fresh.ownerIds];
    const userProjections =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);
    const createdByUser = fresh.createdById
      ? (userProjections.getByUserId(fresh.createdById) ?? null)
      : null;

    const capabilities = await this.reportAccessService.computeCapabilitiesForReport(
      command.userId,
      command.roles,
      fresh,
      command.projectId
    );

    return this.mapper.toDomainDto(
      fresh,
      createdByUser,
      resolveOwnerUsers(fresh.ownerIds, userProjections),
      capabilities
    );
  }
}
