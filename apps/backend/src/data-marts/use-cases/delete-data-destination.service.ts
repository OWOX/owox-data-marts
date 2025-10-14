import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { DataDestinationService } from '../services/data-destination.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

@Injectable()
export class DeleteDataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly dataDestinationService: DataDestinationService
  ) {}

  async run(command: DeleteDataDestinationCommand): Promise<void> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.id,
      command.projectId
    );

    const reportsCount = await this.reportRepository
      .createQueryBuilder('report')
      .innerJoin('report.dataMart', 'dataMart')
      .where('report.dataDestinationId = :destinationId', {
        destinationId: destination.id,
      })
      .getCount();

    if (reportsCount > 0) {
      throw new BusinessViolationException(
        `Cannot delete the destination because it is referenced by ${reportsCount} existing report(s).`
      );
    }

    await this.dataDestinationRepository.softDelete({
      id: command.id,
      projectId: command.projectId,
    });
  }
}
