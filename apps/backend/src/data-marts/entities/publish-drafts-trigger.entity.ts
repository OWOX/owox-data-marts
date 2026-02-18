import { Entity, Column } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { PublishDataStorageDraftsResponseApiDto } from '../dto/presentation/publish-data-storage-drafts-response-api.dto';

@Entity('publish_drafts_triggers')
export class PublishDraftsTrigger extends UiTrigger<PublishDataStorageDraftsResponseApiDto> {
  @Column()
  dataStorageId: string;

  @Column()
  projectId: string;
}
