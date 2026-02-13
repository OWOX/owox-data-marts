import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { DataMartService } from '../services/data-mart.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

const BATCH_SIZE = 1000;

@Injectable()
export class ListDataMartsStreamingService {
  private readonly logger = new Logger(ListDataMartsStreamingService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportService: ReportService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper
  ) {}

  async stream(command: ListDataMartsCommand, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    res.write('[');

    let offset = 0;
    let isFirstItem = true;
    let totalStreamed = 0;

    try {
      while (true) {
        if (res.closed) {
          this.logger.warn('Streaming aborted: response closed by client');
          res.destroy();
          return;
        }

        const batch = await this.dataMartService.findByProjectIdBatched(command.projectId, {
          connectorName: command.connectorName,
          offset,
          limit: BATCH_SIZE,
        });

        if (batch.length === 0) break;

        const ids = batch.map(dm => dm.id);

        const [triggerCountMap, reportCountMap, userProjections] = await Promise.all([
          this.scheduledTriggerService.countByDataMartIds(ids),
          this.reportService.countByDataMartIds(ids),
          this.userProjectionsFetcherService.fetchRelevantUserProjections(batch),
        ]);

        for (const dm of batch) {
          const dto = this.mapper.toDomainDto(
            dm,
            {
              triggersCount: triggerCountMap.get(dm.id) ?? 0,
              reportsCount: reportCountMap.get(dm.id) ?? 0,
            },
            userProjections.getByUserId(dm.createdById)
          );

          const apiDto = await this.mapper.toResponse(dto);
          const json = JSON.stringify(apiDto);

          res.write(isFirstItem ? json : ',' + json);
          isFirstItem = false;
          totalStreamed++;
        }

        if (batch.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }

      res.write(']');
      res.end();

      this.logger.log(`Streaming list completed: ${totalStreamed} data marts sent`);
    } catch (error) {
      if (!res.headersSent) {
        res.destroy();
        throw error;
      }
      this.logger.error(
        `Streaming error after ${totalStreamed} items: ${error instanceof Error ? error.message : String(error)}`
      );
      res.end();
    }
  }
}
