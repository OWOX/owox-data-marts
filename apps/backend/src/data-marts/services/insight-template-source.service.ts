import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
