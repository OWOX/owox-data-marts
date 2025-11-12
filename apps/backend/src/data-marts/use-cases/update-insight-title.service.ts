import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightDto } from '../dto/domain/insight.dto';
import { UpdateInsightTitleCommand } from '../dto/domain/update-insight-title.command';
import { Insight } from '../entities/insight.entity';
import { InsightMapper } from '../mappers/insight.mapper';

@Injectable()
export class UpdateInsightTitleService {
  constructor(
    @InjectRepository(Insight)
    private readonly insightRepository: Repository<Insight>,
    private readonly mapper: InsightMapper
  ) {}

  async run(command: UpdateInsightTitleCommand): Promise<InsightDto> {
    const insight = await this.insightRepository.findOne({
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

    insight.title = command.title;
    await this.insightRepository.save(insight);

    return this.mapper.toDomainDto(insight);
  }
}
