import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DeleteInsightTemplateSourceCommand } from '../dto/domain/delete-insight-template-source.command';
import { InsightArtifactService } from '../services/insight-artifact.service';
import { InsightTemplateService } from '../services/insight-template.service';
import { InsightTemplateSourceService } from '../services/insight-template-source.service';
import { InsightTemplateValidationService } from '../services/insight-template-validation.service';

@Injectable()
export class DeleteInsightTemplateSourceService {
  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightTemplateSourceService: InsightTemplateSourceService,
    private readonly insightTemplateValidationService: InsightTemplateValidationService,
    private readonly insightArtifactService: InsightArtifactService
  ) {}

  @Transactional()
  async run(command: DeleteInsightTemplateSourceCommand): Promise<void> {
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );
    const source = await this.insightTemplateSourceService.getByIdAndTemplateId(
      command.sourceId,
      template.id
    );

    this.insightTemplateValidationService.ensureSourceKeyIsNotUsedInTemplate(
      template.template,
      source.key
    );

    await this.insightTemplateSourceService.hardDeleteByIdAndTemplateId(source.id, template.id);
    await this.insightArtifactService.softDelete(source.artifactId);
  }
}
