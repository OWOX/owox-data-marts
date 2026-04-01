import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { ListReportsByProjectCommand } from '../dto/domain/list-reports-by-project.command';
import { ReportDto } from '../dto/domain/report.dto';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListReportsByProjectService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly mapper: ReportMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(command: ListReportsByProjectCommand): Promise<ReportDto[]> {
    // Get all data reports for the project
    let reports = await this.reportRepository.find({
      where: {
        dataMart: {
          projectId: command.projectId,
        },
      },
      relations: ['dataMart', 'dataDestination'],
    });

    if (command.ownerFilter === OwnerFilter.HAS_OWNERS) {
      reports = reports.filter(r => r.ownerIds.length > 0);
    } else if (command.ownerFilter === OwnerFilter.NO_OWNERS) {
      reports = reports.filter(r => r.ownerIds.length === 0);
    }

    const allUserIds = reports.flatMap(r => [r.createdById, ...r.ownerIds]);
    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchUserProjectionsList(allUserIds);

    return this.mapper.toDomainDtoList(reports, userProjectionsList);
  }
}
