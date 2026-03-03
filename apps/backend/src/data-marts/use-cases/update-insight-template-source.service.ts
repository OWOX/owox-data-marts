import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { InsightTemplateSourceDetailsDto } from '../dto/domain/insight-template-source-details.dto';
import { UpdateInsightTemplateSourceCommand } from '../dto/domain/update-insight-template-source.command';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { InsightTemplateSourceMapper } from '../mappers/insight-template-source.mapper';
import { InsightArtifactService } from '../services/insight-artifact.service';
import { InsightTemplateService } from '../services/insight-template.service';
import { InsightTemplateSourceService } from '../services/insight-template-source.service';

@Injectable()
export class UpdateInsightTemplateSourceService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly insightArtifactRepository: Repository<InsightArtifact>,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightTemplateSourceService: InsightTemplateSourceService,
    private readonly insightArtifactService: InsightArtifactService,
    private readonly mapper: InsightTemplateSourceMapper
  ) {}

  @Transactional()
  async run(command: UpdateInsightTemplateSourceCommand): Promise<InsightTemplateSourceDetailsDto> {
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );
    const source = await this.insightTemplateSourceService.getByIdAndTemplateId(
      command.sourceId,
      template.id
    );
    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      source.artifactId,
      command.dataMartId,
      command.projectId
    );

    artifact.title = command.title;
    artifact.sql = command.sql;
    artifact.validationStatus = InsightArtifactValidationStatus.VALID;
    artifact.validationError = null;
    source.insightArtifact = await this.insightArtifactRepository.save(artifact);

    return this.mapper.toDomainDto(source);
  }
}
