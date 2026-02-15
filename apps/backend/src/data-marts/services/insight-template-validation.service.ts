import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  InsightTemplateSourceType,
  InsightTemplateSources,
} from '../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifactService } from './insight-artifact.service';

@Injectable()
export class InsightTemplateValidationService {
  constructor(private readonly insightArtifactService: InsightArtifactService) {}

  validateTemplateText(template?: string | null): void {
    if (!template) {
      return;
    }

    // In InsightTemplate flow {{prompt}} and {{#prompt}} are not supported.
    if (/{{\s*#?\s*prompt\b/i.test(template)) {
      throw new BusinessViolationException('`prompt` tag is not supported for Insight Templates');
    }
  }

  async validateSources(
    sources: InsightTemplateSources | undefined,
    params: {
      dataMartId: string;
      projectId: string;
    }
  ): Promise<void> {
    if (!sources) {
      return;
    }

    const seenKeys = new Set<string>();

    for (const source of sources) {
      if (seenKeys.has(source.key)) {
        throw new BusinessViolationException(`Source key "${source.key}" must be unique`);
      }
      seenKeys.add(source.key);

      if (source.key === 'main') {
        throw new BusinessViolationException(
          'Source key "main" is reserved for the current data mart source'
        );
      }

      if (source.type === InsightTemplateSourceType.CURRENT_DATA_MART) {
        continue;
      }

      if (!source.artifactId) {
        throw new BusinessViolationException(
          `Source "${source.key}" with type INSIGHT_ARTIFACT must provide artifactId`
        );
      }

      await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
        source.artifactId,
        params.dataMartId,
        params.projectId
      );
    }
  }
}
