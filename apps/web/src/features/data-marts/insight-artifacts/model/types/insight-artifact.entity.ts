import type { InsightArtifactValidationStatus } from './insight-artifacts.dto';

export interface InsightArtifactEntity {
  id: string;
  title: string;
  sql: string;
  validationStatus: InsightArtifactValidationStatus;
  validationError: string | null;
  createdById: string;
  createdAt: Date;
  modifiedAt: Date;
}
