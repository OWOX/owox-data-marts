import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { ReportDto } from '../dto/domain/report.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataDestinationAccessValidatorFacade } from '../data-destination-types/facades/data-destination-access-validator.facade';
import { DataMartService } from '../services/data-mart.service';
import { DataDestinationService } from '../services/data-destination.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

@Injectable()
export class CreateReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly dataMartService: DataMartService,
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationAccessValidationFacade: DataDestinationAccessValidatorFacade,
    private readonly mapper: ReportMapper
  ) {}

  async run(command: CreateReportCommand): Promise<ReportDto> {
    // Get the data mart and verify it's in published status
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
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

    return this.mapper.toDomainDto(newReport);
  }
}
