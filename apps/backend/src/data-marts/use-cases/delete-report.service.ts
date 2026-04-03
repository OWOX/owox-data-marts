import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Report } from '../entities/report.entity';
import { DeleteReportCommand } from '../dto/domain/delete-report.command';
import { ReportService } from '../services/report.service';
import { ReportAccessService } from '../services/report-access.service';

@Injectable()
export class DeleteReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportService: ReportService,
    private readonly reportAccessService: ReportAccessService
  ) {}

  async run(command: DeleteReportCommand): Promise<void> {
    const report = await this.reportRepository.findOne({
      where: {
        id: command.id,
        dataMart: {
          projectId: command.projectId,
        },
      },
      relations: ['dataMart'],
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

    await this.reportService.deleteReport(report);
  }
}
