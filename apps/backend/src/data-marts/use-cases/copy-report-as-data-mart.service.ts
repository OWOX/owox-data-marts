import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartService } from '../services/data-mart.service';
import { GetReportGeneratedSqlService } from './get-report-generated-sql.service';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';

@Injectable()
export class CopyReportAsDataMartService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly getGeneratedSqlService: GetReportGeneratedSqlService,
    private readonly dataMartService: DataMartService
  ) {}

  @Transactional()
  async run(reportId: string, userId: string, projectId: string): Promise<DataMart> {
    const report = await this.reportRepository.findOne({
      where: {
        id: reportId,
        dataMart: { projectId },
      },
      relations: ['dataMart', 'dataMart.storage', 'dataMart.storage.credential', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${reportId} not found`);
    }

    const { sql } = await this.getGeneratedSqlService.run(reportId, projectId);

    const { dataMart: sourceDataMart } = report;

    const definition: SqlDefinition = { sqlQuery: sql };

    const newDataMart = this.dataMartService.create({
      title: `Copy of ${report.title}`,
      projectId,
      createdById: userId,
      technicalOwnerIds: [userId],
      storage: sourceDataMart.storage,
      definitionType: DataMartDefinitionType.SQL,
      definition,
      status: DataMartStatus.DRAFT,
    });

    return this.dataMartService.save(newDataMart);
  }
}
