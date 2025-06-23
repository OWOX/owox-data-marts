import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataMartService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>
  ) {}

  async getByIdAndProjectIdAndUserId(
    id: string,
    projectId: string,
    userId: string
  ): Promise<DataMart> {
    const entity = await this.dataMartRepository.findOne({
      where: { id, projectId, createdById: userId },
    });

    if (!entity) {
      throw new NotFoundException(
        `DataMart with id ${id} and projectId ${projectId} and userId ${userId} not found`
      );
    }

    return entity;
  }

  async findByStorage(storage: DataStorage): Promise<DataMart[]> {
    return this.dataMartRepository.find({ where: { storage: { id: storage.id } } });
  }
}
