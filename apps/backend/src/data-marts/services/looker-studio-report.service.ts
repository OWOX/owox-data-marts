import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { Report } from '../entities/report.entity';

@Injectable()
export class LookerStudioReportService {
  constructor(
    @InjectRepository(Report)
    private readonly repository: Repository<Report>
  ) {}

  @Transactional()
  async restoreIfDeleted(report: Report): Promise<Report | null> {
    if (report.dataDestination.type !== DataDestinationType.LOOKER_STUDIO) {
      return null;
    }

    const existing = await this.repository.findOne({
      where: {
        dataMart: { id: report.dataMart.id, projectId: report.dataMart.projectId },
        dataDestination: { id: report.dataDestination.id },
      },
      withDeleted: true,
    });
    if (!existing) {
      return null;
    }
    if (!existing.deletedAt) {
      throw new BusinessViolationException(
        'A Looker Studio report already exists for this data mart and destination.'
      );
    }

    const restored = await this.repository.restore({
      id: existing.id,
      deletedAt: Not(IsNull()),
    });
    if (!restored.affected) {
      throw new BusinessViolationException('This Looker Studio report has already been enabled.');
    }

    // Apply the new connection settings without overwriting identity or run history.
    await this.repository.update(existing.id, {
      title: '',
      createdById: report.createdById,
      destinationConfig: report.destinationConfig,
      columnConfig: report.columnConfig,
      filterConfig: report.filterConfig,
      sortConfig: report.sortConfig,
      limitConfig: report.limitConfig,
      aggregationConfig: report.aggregationConfig,
      dateTruncConfig: report.dateTruncConfig,
      uniqueCountConfig: report.uniqueCountConfig,
    });
    return this.repository.findOneByOrFail({ id: existing.id });
  }
}
