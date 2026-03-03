import { InsightArtifactValidationStatus } from '../../enums/insight-artifact-validation-status.enum';

export class InsightTemplateSourceDetailsDto {
  constructor(
    public readonly templateSourceId: string,
    public readonly key: string,
    public readonly artifactId: string,
    public readonly title: string,
    public readonly sql: string,
    public readonly validationStatus: InsightArtifactValidationStatus,
    public readonly validationError: string | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date
  ) {}
}
