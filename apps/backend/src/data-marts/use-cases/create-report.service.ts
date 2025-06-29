import { Repository } from 'typeorm';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { ReportMapper } from '../mappers/report.mapper';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { ReportDto } from '../dto/domain/report.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataDestinationAccessValidatorFacade } from '../data-destination-types/facades/data-destination-access-validator.facade';

@Injectable()
export class CreateReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    private readonly dataDestinationAccessValidationFacade: DataDestinationAccessValidatorFacade,
    private readonly mapper: ReportMapper
  ) {}

  async run(command: CreateReportCommand): Promise<ReportDto> {
    // Get the data mart and verify it's in published status
    const dataMart = await this.dataMartRepository.findOne({
      where: {
        id: command.dataMartId,
        projectId: command.projectId,
      },
    });

    if (!dataMart) {
      throw new BadRequestException(`Data mart with ID ${command.dataMartId} not found`);
    }

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BadRequestException(
        `Cannot create report for data mart with status ${dataMart.status}. Data mart must be in PUBLISHED status.`
      );
    }

    // Get the data destination
    const dataDestination = await this.dataDestinationRepository.findOne({
      where: {
        id: command.dataDestinationId,
        projectId: command.projectId,
      },
    });

    if (!dataDestination) {
      throw new BadRequestException(
        `Data destination with ID ${command.dataDestinationId} not found`
      );
    }

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
      destinationConfig: command.destinationConfig,
    });

    const newReport = await this.reportRepository.save(report);

    return this.mapper.toDomainDto(newReport);
  }
}
