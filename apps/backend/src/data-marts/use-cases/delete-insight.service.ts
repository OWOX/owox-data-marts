import { Injectable } from '@nestjs/common';
import { InsightService } from '../services/insight.service';
import { DeleteInsightCommand } from '../dto/domain/delete-insight.command';

@Injectable()
export class DeleteInsightService {
  constructor(private readonly insightService: InsightService) {}

  async run(command: DeleteInsightCommand): Promise<void> {
    const insight = await this.insightService.getByIdAndDataMartIdAndProjectId(
      command.insightId,
      command.dataMartId,
      command.projectId
    );
    await this.insightService.softDelete(insight.id);
  }
}
