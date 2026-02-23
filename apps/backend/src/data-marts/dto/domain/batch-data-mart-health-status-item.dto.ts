import { DataMartRunDto } from './data-mart-run.dto';

export class BatchDataMartHealthStatusItemDto {
  constructor(
    public readonly dataMartId: string,
    public connector: DataMartRunDto | null = null,
    public report: DataMartRunDto | null = null,
    public insight: DataMartRunDto | null = null
  ) {}
}
