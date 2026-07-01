import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProjectSetupProgressService } from './project-setup-progress.service';
import { DataStorageCreatedEvent } from '../events/data-storage-created.event';
import { DataMartCreatedEvent } from '../events/data-mart-created.event';
import { DataMartPublishedEvent } from '../events/data-mart-published.event';
import { DataDestinationCreatedEvent } from '../events/data-destination-created.event';
import { ReportCreatedEvent } from '../events/report-created.event';
import { ReportRunCompletedSuccessfullyEvent } from '../events/report-run-completed-successfully.event';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';

@Injectable()
export class ProjectSetupProgressListenerService {
  constructor(private readonly progressService: ProjectSetupProgressService) {}

  @OnEvent('data-storage.created', { async: true })
  async onStorageCreated(event: DataStorageCreatedEvent): Promise<void> {
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasStorage');
  }

  @OnEvent('data-mart.created', { async: true })
  async onDataMartCreated(event: DataMartCreatedEvent): Promise<void> {
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasDraftDataMart');
  }

  @OnEvent('data-mart.published', { async: true })
  async onDataMartPublished(event: DataMartPublishedEvent): Promise<void> {
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasPublishedDataMart');
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasDraftDataMart');
  }

  @OnEvent('data-destination.created', { async: true })
  async onDestinationCreated(event: DataDestinationCreatedEvent): Promise<void> {
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasDestination');
    if (event.payload.destinationType === DataDestinationType.GOOGLE_SHEETS) {
      await this.progressService.markProjectStepDone(
        event.payload.projectId,
        'hasGoogleSheetsDestination'
      );
    }
  }

  @OnEvent('report.created', { async: true })
  async onReportCreated(event: ReportCreatedEvent): Promise<void> {
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasReport');
  }

  @OnEvent('report-run.completed.successfully', { async: true })
  async onReportRunSuccess(event: ReportRunCompletedSuccessfullyEvent): Promise<void> {
    const { dataMartId, userId, runType } = event.payload;
    if (!userId) return;

    const projectId = await this.progressService.resolveProjectIdByDataMartId(dataMartId);
    if (!projectId) return;

    await this.progressService.markUserStepDone(projectId, userId, 'hasReportRun');

    if (runType === DataMartRunType.GOOGLE_SHEETS_EXPORT) {
      await this.progressService.markUserStepDone(projectId, userId, 'hasGoogleSheetsExtension');
      await this.progressService.markUserStepDone(projectId, userId, 'hasGoogleSheetsReportRun');
    }
  }
}
