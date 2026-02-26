import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightArtifactMapper } from '../mappers/insight-artifact.mapper';
import { InsightArtifactDto } from '../dto/domain/insight-artifact.dto';
import { UpdateInsightArtifactCommand } from '../dto/domain/update-insight-artifact.command';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';

@Injectable()
export class UpdateInsightArtifactService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly repository: Repository<InsightArtifact>,
    private readonly mapper: InsightArtifactMapper
  ) {}

  async run(command: UpdateInsightArtifactCommand): Promise<InsightArtifactDto> {
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

    if (command.title !== undefined) {
      artifact.title = command.title;
    }
    if (command.sql !== undefined) {
      artifact.sql = command.sql;
      artifact.validationStatus = InsightArtifactValidationStatus.VALID;
      artifact.validationError = null;
    }

    const saved = await this.repository.save(artifact);
    return this.mapper.toDomainDto(saved);
  }
}
