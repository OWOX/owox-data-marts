import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProjectSetupProgressService } from './project-setup-progress.service';
import { DataStorageCreatedEvent } from '../events/data-storage-created.event';
import { DataMartCreatedEvent } from '../events/data-mart-created.event';
import { DataMartPublishedEvent } from '../events/data-mart-published.event';
import { DataDestinationCreatedEvent } from '../events/data-destination-created.event';
import { ReportCreatedEvent } from '../events/report-created.event';
import { ReportRunCompletedSuccessfullyEvent } from '../events/report-run-completed-successfully.event';

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
  }

  @OnEvent('report.created', { async: true })
  async onReportCreated(event: ReportCreatedEvent): Promise<void> {
    await this.progressService.markProjectStepDone(event.payload.projectId, 'hasReport');
  }

  @OnEvent('report-run.completed.successfully', { async: true })
  async onReportRunSuccess(event: ReportRunCompletedSuccessfullyEvent): Promise<void> {
    const { dataMartId, userId } = event.payload;
    if (!userId) return;

    const projectId = await this.progressService.resolveProjectIdByDataMartId(dataMartId);
    if (projectId) {
      await this.progressService.markUserStepDone(projectId, userId, 'hasReportRun');
    }
  }
}
