import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

@Injectable()
export class DataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>
  ) {}

  async getByIdAndProjectId(id: string, projectId: string): Promise<DataDestination> {
    const entity = await this.dataDestinationRepository.findOne({
      where: { id, projectId },
      relations: ['owners', 'contexts', 'contexts.context'],
    });

    if (!entity) {
      throw new NotFoundException(
        `Data Destination with id ${id} and projectId ${projectId} not found`
      );
    }

    return entity;
  }

  /**
   * Every destination of one type in a project, oldest first — so a caller resolving a shared
   * destination keeps being handed the same one once it exists.
   *
   * No relations: callers pick by id afterwards, and loading owners and contexts for a list that
   * is only scanned would pay for what nothing reads.
   */
  async listByProjectIdAndType(
    projectId: string,
    type: DataDestinationType
  ): Promise<DataDestination[]> {
    return this.dataDestinationRepository.find({
      where: { projectId, type },
      order: { createdAt: 'ASC' },
    });
  }
}
