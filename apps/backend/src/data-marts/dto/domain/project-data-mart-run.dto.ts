import { DataMartRunDto } from './data-mart-run.dto';

export interface ProjectDataMartRunRefDto {
  readonly id: string;
  readonly title: string;
}

export class ProjectDataMartRunDto {
  constructor(
    public readonly run: DataMartRunDto,
    public readonly dataMart: ProjectDataMartRunRefDto
  ) {}
}
