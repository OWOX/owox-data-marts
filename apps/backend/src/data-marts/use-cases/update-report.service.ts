import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
import { ReportAccessService } from '../services/report-access.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';

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
    private readonly reportDataCacheService: ReportDataCacheService
  ) {}

  @Transactional()
  async run(command: UpdateReportCommand): Promise<ReportDto> {
    // Find the existing report
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

    // Get the data destination if it's being changed
    let dataDestination: DataDestination | null = report.dataDestination;
    if (command.dataDestinationId !== dataDestination.id) {
      dataDestination = await this.dataDestinationService.getByIdAndProjectId(
        command.dataDestinationId,
        command.projectId
      );
    }

    this.availableDestinationTypesService.verifyIsAllowed(dataDestination.type);

    // Validate access to the data destination
    await this.dataDestinationAccessValidationFacade.checkAccess(
      dataDestination.type,
      command.destinationConfig,
      dataDestination
    );

    // Validate owners BEFORE mutating
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

    // Detect columnConfig change BEFORE we overwrite the entity so we can
    // invalidate the cache for this report after save. Serialized compare
    // handles null, empty arrays, and order changes uniformly.
    const previousColumnConfig = report.columnConfig ?? null;
    const nextColumnConfig = command.columnConfig ?? null;
    const columnConfigChanged =
      JSON.stringify(previousColumnConfig) !== JSON.stringify(nextColumnConfig);

    // Update the report
    report.title = command.title;
    report.dataDestination = dataDestination;
    report.destinationConfig = command.destinationConfig;
    report.columnConfig = nextColumnConfig;

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

    if (columnConfigChanged) {
      // Stale cache would otherwise serve the old column set until TTL
      // expires (default 1h). Invalidate so the next read applies the
      // new selection immediately.
      await this.reportDataCacheService.invalidateByReportId(updatedReport.id);
    }

    // Reload to get fresh owners
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

    return this.mapper.toDomainDto(
      fresh,
      createdByUser,
      resolveOwnerUsers(fresh.ownerIds, userProjections)
    );
  }
}
