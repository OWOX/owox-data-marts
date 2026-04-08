import { Repository } from 'typeorm';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Report } from '../entities/report.entity';
import { DeleteReportCommand } from '../dto/domain/delete-report.command';
import { ReportService } from '../services/report.service';
import { ReportAccessService } from '../services/report-access.service';
import { ReportDeletedEvent } from '../events/report-deleted.event';

@Injectable()
export class DeleteReportService {
  private readonly logger = new Logger(DeleteReportService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportService: ReportService,
    private readonly reportAccessService: ReportAccessService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async run(command: DeleteReportCommand): Promise<void> {
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

    await this.reportAccessService.checkMutateAccess(
      command.userId,
      command.roles,
      command.id,
      command.projectId
    );

    this.logger.debug(`[Report] Deleting report ${report.id} | DataMart: ${report.dataMart.id}`);

    const deletedEvent = new ReportDeletedEvent(report);

    await this.reportService.deleteReport(report);

    this.logger.debug(
      `[Report] Report ${report.id} deleted from database | Emitting report.deleted event`
    );

    // Emit event for external systems (e.g., Google Sheets metadata cleanup)
    this.eventEmitter.emit('report.deleted', deletedEvent);

    this.logger.debug(
      `[Report] report.deleted event emitted for report ${report.id} | ` +
        `Destination type: ${report.dataDestination.type}`
    );
  }
}
