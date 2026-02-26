import { Injectable } from '@nestjs/common';
import { InsightArtifactDto } from '../dto/domain/insight-artifact.dto';
import { ListInsightArtifactsCommand } from '../dto/domain/list-insight-artifacts.command';
import { InsightArtifactMapper } from '../mappers/insight-artifact.mapper';
import { InsightArtifactService } from '../services/insight-artifact.service';

@Injectable()
export class ListInsightArtifactsService {
  constructor(
    private readonly insightArtifactService: InsightArtifactService,
    private readonly mapper: InsightArtifactMapper
  ) {}

  async run(command: ListInsightArtifactsCommand): Promise<InsightArtifactDto[]> {
    const artifacts = await this.insightArtifactService.listByDataMartIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    return this.mapper.toDomainDtoList(artifacts);
  }
}
