import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { LookerStudioConnectorCredentialsType } from '../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-credentials.schema';
import { Report } from '../entities/report.entity';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly repository: Repository<Report>
  ) {}

  async getByIdAndDataMartIdAndProjectId(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<Report> {
    const report = await this.repository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    return report;
  }

  async getByLookerStudioSecret(secret: string): Promise<Report[]> {
    return await this.repository.find({
      where: {
        dataDestination: {
          type: DataDestinationType.LOOKER_STUDIO_CONNECTOR,
          credentials: Raw(
            alias =>
              `JSON_EXTRACT(${alias}, '$.type') = :credType AND JSON_EXTRACT(${alias}, '$.secret') = :secret`,
            {
              credType: LookerStudioConnectorCredentialsType,
              secret,
            }
          ),
        },
      },
      relations: ['dataMart', 'dataDestination'],
    });
  }

  async getByIdAndLookerStudioSecret(id: string, secret: string): Promise<Report | null> {
    return await this.repository.findOne({
      where: {
        id,
        dataDestination: {
          type: DataDestinationType.LOOKER_STUDIO_CONNECTOR,
          credentials: Raw(
            alias =>
              `JSON_EXTRACT(${alias}, '$.type') = :credType AND JSON_EXTRACT(${alias}, '$.secret') = :secret`,
            {
              credType: LookerStudioConnectorCredentialsType,
              secret,
            }
          ),
        },
      },
      relations: ['dataMart', 'dataDestination'],
    });
  }
}
