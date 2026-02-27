import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';

@Injectable()
export class DataDestinationService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>
  ) {}

  async getByIdAndProjectId(id: string, projectId: string): Promise<DataDestination> {
    const entity = await this.dataDestinationRepository.findOne({
      where: { id, projectId },
    });

    if (!entity) {
      throw new NotFoundException(
        `DataDestination with id ${id} and projectId ${projectId} not found`
      );
    }

    return entity;
  }
}
