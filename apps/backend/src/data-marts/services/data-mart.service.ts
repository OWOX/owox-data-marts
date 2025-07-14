import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartSchemaMergerFacade } from '../data-storage-types/facades/data-mart-schema-merger.facade';
import { DataMartSchemaProviderFacade } from '../data-storage-types/facades/data-mart-schema-provider.facade';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataMartService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly dataMartSchemaProviderFacade: DataMartSchemaProviderFacade,
    private readonly dataMartSchemaMergerFacade: DataMartSchemaMergerFacade
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

  async actualizeSchema(id: string, projectId: string, userId: string): Promise<DataMart> {
    const dataMart = await this.getByIdAndProjectIdAndUserId(id, projectId, userId);
    await this.actualizeSchemaInEntity(dataMart);
    await this.dataMartRepository.save(dataMart);
    return dataMart;
  }

  async actualizeSchemaInEntity(dataMart: DataMart): Promise<DataMart> {
    // Get the new schema from the provider
    const newSchema = await this.dataMartSchemaProviderFacade.getActualDataMartSchema(dataMart);

    // Merge the existing schema with the actual one
    dataMart.schema = await this.dataMartSchemaMergerFacade.mergeSchemas(
      dataMart.storage.type,
      dataMart.schema,
      newSchema
    );

    return dataMart;
  }

  async save(dataMart: DataMart): Promise<DataMart> {
    return this.dataMartRepository.save(dataMart);
  }
}
