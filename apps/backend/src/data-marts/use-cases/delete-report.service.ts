import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { GetReportCommand } from '../dto/domain/get-report.command';

@Injectable()
export class DeleteReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>
  ) {}

  async run(command: GetReportCommand): Promise<void> {
    const report = await this.reportRepository.findOne({
      where: {
        id: command.id,
        dataMart: {
          projectId: command.projectId,
        },
      },
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${command.id} not found`);
    }

    await this.reportRepository.remove(report);
  }
}
