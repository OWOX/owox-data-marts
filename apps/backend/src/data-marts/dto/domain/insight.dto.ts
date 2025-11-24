import { DataMartRunDto } from './data-mart-run.dto';

export class InsightDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly template: string | null,
    public readonly output: string | null,
    public readonly outputUpdatedAt: Date | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly lastManualDataMartRun: DataMartRunDto | null
  ) {}
}
