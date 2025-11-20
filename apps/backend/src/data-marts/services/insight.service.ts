import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insight } from '../entities/insight.entity';

@Injectable()
export class InsightService {
  constructor(
    @InjectRepository(Insight)
    private readonly repository: Repository<Insight>
  ) {}

  async getByIdAndDataMartIdAndProjectId(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<Insight> {
    const insight = await this.repository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart', 'lastDataMartRun'],
    });

    if (!insight) {
      throw new NotFoundException(`Insight with id ${id} not found`);
    }

    return insight;
  }

  async listByDataMartIdAndProjectId(dataMartId: string, projectId: string): Promise<Insight[]> {
    return await this.repository.find({
      where: {
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart', 'lastDataMartRun'],
      order: { createdAt: 'DESC' },
    });
  }

  async softDelete(insightId: string): Promise<void> {
    await this.repository.softDelete(insightId);
  }
}
