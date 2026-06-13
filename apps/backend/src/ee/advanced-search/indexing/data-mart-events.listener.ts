import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { DataMartCreatedEventPayload } from '../../../data-marts/events/data-mart-created.event';
import type { DataMartPublishedEventPayload } from '../../../data-marts/events/data-mart-published.event';
import type { DataMartDefinitionSetEventPayload } from '../../../data-marts/events/data-mart-definition-set.event';
import { EeLicenseService } from '../../shared/ee-license.service';
import { SearchIndexerService } from './search-indexer.service';

type WithDataMartId = { dataMartId: string; projectId: string };

@Injectable()
export class DataMartEventsListener {
  private readonly logger = new Logger(DataMartEventsListener.name);

  constructor(
    private readonly indexer: SearchIndexerService,
    private readonly eeLicense: EeLicenseService
  ) {}

  @OnEvent('data-mart.created', { async: true })
  async onCreated(payload: DataMartCreatedEventPayload): Promise<void> {
    await this.reindex(payload);
  }

  @OnEvent('data-mart.published', { async: true })
  async onPublished(payload: DataMartPublishedEventPayload): Promise<void> {
    await this.reindex(payload);
  }

  @OnEvent('data-mart.definition.set', { async: true })
  async onDefinitionSet(payload: DataMartDefinitionSetEventPayload): Promise<void> {
    await this.reindex(payload);
  }

  private async reindex(payload: WithDataMartId): Promise<void> {
    if (!this.eeLicense.isLicensed()) return;
    try {
      await this.indexer.reindexDataMart(payload.dataMartId, payload.projectId);
    } catch (err) {
      this.logger.error(`reindex failed for dataMartId=${payload.dataMartId}`, err);
    }
  }
}
