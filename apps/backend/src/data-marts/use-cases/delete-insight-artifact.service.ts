import { Injectable } from '@nestjs/common';
import { DeleteInsightArtifactCommand } from '../dto/domain/delete-insight-artifact.command';
import { InsightArtifactService } from '../services/insight-artifact.service';

@Injectable()
export class DeleteInsightArtifactService {
  constructor(private readonly insightArtifactService: InsightArtifactService) {}

  async run(command: DeleteInsightArtifactCommand): Promise<void> {
    await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      command.insightArtifactId,
      command.dataMartId,
      command.projectId
    );

    await this.insightArtifactService.softDelete(command.insightArtifactId);
  }
}
