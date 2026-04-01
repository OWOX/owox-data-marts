import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

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
    private readonly reportOwnerRepository: Repository<ReportOwner>
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
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${command.id} not found`);
    }

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

    // Update the report
    report.title = command.title;
    report.dataDestination = dataDestination;
    report.destinationConfig = command.destinationConfig;

    const updatedReport = await this.reportRepository.save(report);

    if (command.ownerIds !== undefined) {
      const uniqueOwnerIds = [...new Set(command.ownerIds)];
      if (uniqueOwnerIds.length > 0) {
        const projectId = report.dataMart.projectId;
        const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
        const memberIds = new Set(members.filter(m => !m.isOutbound).map(m => m.userId));
        const invalidIds = uniqueOwnerIds.filter(id => !memberIds.has(id));
        if (invalidIds.length > 0) {
          throw new BadRequestException(
            `The following user IDs are not members of this project: ${invalidIds.join(', ')}`
          );
        }
      }
      await this.reportOwnerRepository.delete({ reportId: updatedReport.id });
      const owners = uniqueOwnerIds.map(userId => {
        const o = new ReportOwner();
        o.reportId = updatedReport.id;
        o.userId = userId;
        return o;
      });
      await this.reportOwnerRepository.save(owners);
    }

    // Reload to get fresh owners
    const fresh = await this.reportRepository.findOne({
      where: { id: updatedReport.id },
      relations: ['dataMart', 'dataDestination'],
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
