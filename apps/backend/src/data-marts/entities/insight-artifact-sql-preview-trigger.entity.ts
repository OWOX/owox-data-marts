import { Column, Entity } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { InsightArtifactSqlPreviewTriggerResponseApiDto } from '../dto/presentation/insight-artifact-sql-preview-trigger-response-api.dto';

@Entity('insight_artifact_sql_preview_triggers')
export class InsightArtifactSqlPreviewTrigger extends UiTrigger<InsightArtifactSqlPreviewTriggerResponseApiDto> {
  @Column()
  dataMartId: string;

  @Column()
  projectId: string;

  @Column()
  insightArtifactId: string;

  @Column({ type: 'text', nullable: true })
  sql?: string | null;
}
