import type { InsightTemplateSourceValidationStatus } from './insight-template-sources.dto';
export type { InsightTemplateSourceValidationStatus };

export interface InsightTemplateSourceEntity {
  id: string;
  key: string;
  artifactId: string;
  title: string;
  sql: string;
  validationStatus: InsightTemplateSourceValidationStatus;
  validationError: string | null;
  createdById: string;
  createdAt: Date;
  modifiedAt: Date;
}
