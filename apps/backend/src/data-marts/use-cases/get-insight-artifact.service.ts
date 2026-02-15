import { Injectable } from '@nestjs/common';
import { GetInsightArtifactCommand } from '../dto/domain/get-insight-artifact.command';
import { InsightArtifactDto } from '../dto/domain/insight-artifact.dto';
import { InsightArtifactMapper } from '../mappers/insight-artifact.mapper';
import { InsightArtifactService } from '../services/insight-artifact.service';

@Injectable()
export class GetInsightArtifactService {
  constructor(
    private readonly insightArtifactService: InsightArtifactService,
    private readonly mapper: InsightArtifactMapper
  ) {}

  async run(command: GetInsightArtifactCommand): Promise<InsightArtifactDto> {
    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      command.insightArtifactId,
      command.dataMartId,
      command.projectId
    );

    return this.mapper.toDomainDto(artifact);
  }
}
