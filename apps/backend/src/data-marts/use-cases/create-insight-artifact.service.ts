import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInsightArtifactCommand } from '../dto/domain/create-insight-artifact.command';
import { InsightArtifactDto } from '../dto/domain/insight-artifact.dto';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightArtifactMapper } from '../mappers/insight-artifact.mapper';
import { DataMartService } from '../services/data-mart.service';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';

@Injectable()
export class CreateInsightArtifactService {
  private readonly logger = new Logger(CreateInsightArtifactService.name);

  constructor(
    @InjectRepository(InsightArtifact)
    private readonly repository: Repository<InsightArtifact>,
    private readonly dataMartService: DataMartService,
    private readonly mapper: InsightArtifactMapper
  ) {}

  async run(command: CreateInsightArtifactCommand): Promise<InsightArtifactDto> {
    this.logger.log(`Creating insight artifact for data mart ${command.dataMartId}`);

    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const artifact = this.repository.create({
      title: command.title,
      sql: command.sql,
      dataMart,
      createdById: command.userId,
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    });

    const saved = await this.repository.save(artifact);
    return this.mapper.toDomainDto(saved);
  }
}
