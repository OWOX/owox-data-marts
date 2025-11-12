import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insight } from '../entities/insight.entity';
import { InsightMapper } from '../mappers/insight.mapper';
import { InsightDto } from '../dto/domain/insight.dto';
import { UpdateInsightCommand } from '../dto/domain/update-insight.command';

@Injectable()
export class UpdateInsightService {
  constructor(
    @InjectRepository(Insight)
    private readonly repository: Repository<Insight>,
    private readonly mapper: InsightMapper
  ) {}

  async run(command: UpdateInsightCommand): Promise<InsightDto> {
    const insight = await this.repository.findOne({
      where: {
        id: command.insightId,
        dataMart: {
          id: command.dataMartId,
          projectId: command.projectId,
        },
      },
      relations: ['dataMart'],
    });

    if (!insight) {
      throw new NotFoundException(`Insight with ID ${command.insightId} not found`);
    }

    if (command.title !== undefined) {
      insight.title = command.title;
    }
    if (command.template !== undefined) {
      insight.template = command.template;
    }

    const saved = await this.repository.save(insight);
    return this.mapper.toDomainDto(saved);
  }
}
