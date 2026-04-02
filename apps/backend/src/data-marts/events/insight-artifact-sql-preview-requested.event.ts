import { BaseEvent } from '@owox/internal-helpers';

export interface InsightArtifactSqlPreviewRequestedEventPayload {
  projectId: string;
  dataMartId: string;
  userId: string;
  insightArtifactId: string;
  triggerId: string;
}

export class InsightArtifactSqlPreviewRequestedEvent extends BaseEvent<InsightArtifactSqlPreviewRequestedEventPayload> {
  get name() {
    return 'insight_artifact.sql_preview_requested' as const;
  }

  constructor(payload: InsightArtifactSqlPreviewRequestedEventPayload) {
    super(payload);
  }
}
