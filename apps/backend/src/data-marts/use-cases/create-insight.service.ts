import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insight } from '../entities/insight.entity';
import { CreateInsightCommand } from '../dto/domain/create-insight.command';
import { InsightDto } from '../dto/domain/insight.dto';
import { DataMartService } from '../services/data-mart.service';
import { InsightMapper } from '../mappers/insight.mapper';

@Injectable()
export class CreateInsightService {
  private readonly logger = new Logger(CreateInsightService.name);
  constructor(
    @InjectRepository(Insight)
    private readonly repository: Repository<Insight>,
    private readonly dataMartService: DataMartService,
    private readonly mapper: InsightMapper
  ) {}

  async run(command: CreateInsightCommand): Promise<InsightDto> {
    this.logger.log(`Creating insight for data mart ${command.dataMartId}`);
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const insight = this.repository.create({
      title: command.title,
      template: command.template,
      dataMart,
      createdById: command.userId,
    });

    const saved = await this.repository.save(insight);
    return this.mapper.toDomainDto(saved);
  }
}
