import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightArtifactDto } from '../dto/domain/insight-artifact.dto';
import { InsightArtifactMapper } from '../mappers/insight-artifact.mapper';
import { UpdateInsightArtifactTitleCommand } from '../dto/domain/update-insight-artifact-title.command';

@Injectable()
export class UpdateInsightArtifactTitleService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly repository: Repository<InsightArtifact>,
    private readonly mapper: InsightArtifactMapper
  ) {}

  async run(command: UpdateInsightArtifactTitleCommand): Promise<InsightArtifactDto> {
    const artifact = await this.repository.findOne({
      where: {
        id: command.insightArtifactId,
        dataMart: {
          id: command.dataMartId,
          projectId: command.projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!artifact) {
      throw new NotFoundException(`InsightArtifact with ID ${command.insightArtifactId} not found`);
    }

    artifact.title = command.title;

    const saved = await this.repository.save(artifact);
    return this.mapper.toDomainDto(saved);
  }
}
