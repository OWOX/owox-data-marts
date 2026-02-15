import { Injectable } from '@nestjs/common';
import { DeleteInsightTemplateCommand } from '../dto/domain/delete-insight-template.command';
import { InsightTemplateService } from '../services/insight-template.service';

@Injectable()
export class DeleteInsightTemplateService {
  constructor(private readonly insightTemplateService: InsightTemplateService) {}

  async run(command: DeleteInsightTemplateCommand): Promise<void> {
    await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );

    await this.insightTemplateService.softDelete(command.insightTemplateId);
  }
}
