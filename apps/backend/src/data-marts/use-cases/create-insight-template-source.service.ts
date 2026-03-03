import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { isUniqueConstraintViolation } from '../../common/typeorm/query-error.utils';
import { CreateInsightTemplateSourceCommand } from '../dto/domain/create-insight-template-source.command';
import { InsightTemplateSourceDetailsDto } from '../dto/domain/insight-template-source-details.dto';
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { InsightTemplateSourceMapper } from '../mappers/insight-template-source.mapper';
import { InsightTemplateService } from '../services/insight-template.service';
import { InsightTemplateSourceService } from '../services/insight-template-source.service';

@Injectable()
export class CreateInsightTemplateSourceService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly insightArtifactRepository: Repository<InsightArtifact>,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightTemplateSourceService: InsightTemplateSourceService,
    private readonly mapper: InsightTemplateSourceMapper
  ) {}

  @Transactional()
  async run(command: CreateInsightTemplateSourceCommand): Promise<InsightTemplateSourceDetailsDto> {
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );

    const key = command.key.trim();
    if (!key.length) {
      throw new BusinessViolationException('Source key must not be empty');
    }
    if (key === 'main') {
      throw new BusinessViolationException(
        'Source key "main" is reserved for the current data mart source'
      );
    }

    const keyAlreadyExists = await this.insightTemplateSourceService.existsByKeyAndTemplateId(
      key,
      template.id
    );
    if (keyAlreadyExists) {
      throw new BusinessViolationException(`Source key "${key}" must be unique`);
    }

    const artifact = await this.insightArtifactRepository.save(
      this.insightArtifactRepository.create({
        title: command.title,
        sql: command.sql,
        dataMart: template.dataMart,
        createdById: command.userId,
        validationStatus: InsightArtifactValidationStatus.VALID,
        validationError: null,
      })
    );

    try {
      const source = await this.insightTemplateSourceService.create({
        template,
        key,
        type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
        artifact,
      });

      return this.mapper.toDomainDto(source);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new BusinessViolationException(`Source key "${key}" must be unique`);
      }

      throw error;
    }
  }
}
