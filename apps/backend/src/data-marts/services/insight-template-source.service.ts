import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightTemplateSourceEntity } from '../entities/insight-template-source.entity';

@Injectable()
export class InsightTemplateSourceService {
  constructor(
    @InjectRepository(InsightTemplateSourceEntity)
    private readonly repository: Repository<InsightTemplateSourceEntity>
  ) {}

  async getByIdAndTemplateId(
    sourceId: string,
    templateId: string
  ): Promise<InsightTemplateSourceEntity> {
    const source = await this.repository.findOne({
      where: {
        id: sourceId,
        templateId,
      },
      relations: ['insightArtifact'],
    });

    if (!source) {
      throw new NotFoundException(
        `Template source with id "${sourceId}" and templateId "${templateId}" not found`
      );
    }

    return source;
  }

  async listByTemplateId(templateId: string): Promise<InsightTemplateSourceEntity[]> {
    return this.repository.find({
      where: { templateId },
      relations: ['insightArtifact'],
      order: { createdAt: 'ASC' },
    });
  }

  async existsByKeyAndTemplateId(key: string, templateId: string): Promise<boolean> {
    const source = await this.repository.findOne({
      where: { key, templateId },
      select: ['id'],
    });

    return Boolean(source);
  }

  async create(params: {
    template: InsightTemplate;
    key: string;
    type: InsightTemplateSourceType;
    artifact: InsightArtifact;
  }): Promise<InsightTemplateSourceEntity> {
    const source = await this.repository.save(
      this.repository.create({
        templateId: params.template.id,
        insightTemplate: params.template,
        key: params.key,
        type: params.type,
        artifactId: params.artifact.id,
        insightArtifact: params.artifact,
      })
    );

    source.insightArtifact = params.artifact;
    return source;
  }

  async hardDeleteByIdAndTemplateId(sourceId: string, templateId: string): Promise<void> {
    await this.repository.delete({
      id: sourceId,
      templateId,
    });
  }
}
