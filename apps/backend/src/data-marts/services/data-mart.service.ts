import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartSchemaMergerFacade } from '../data-storage-types/facades/data-mart-schema-merger.facade';
import { DataMartSchemaProviderFacade } from '../data-storage-types/facades/data-mart-schema-provider.facade';
import { DataMartDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';

@Injectable()
export class DataMartService {
  private readonly logger = new Logger(DataMartService.name);

  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly dataMartSchemaProviderFacade: DataMartSchemaProviderFacade,
    private readonly dataMartSchemaMergerFacade: DataMartSchemaMergerFacade
  ) {}

  create(data: Partial<DataMart>): DataMart {
    return this.dataMartRepository.create(data);
  }

  async getByIdAndProjectId(id: string, projectId: string): Promise<DataMart> {
    const entity = await this.dataMartRepository.findOne({
      where: { id, projectId },
      relations: ['connectorState'],
    });

    if (!entity) {
      throw new NotFoundException(`DataMart with id ${id} and projectId ${projectId} not found`);
    }

    return entity;
  }

  async findById(id: string, withDeleted: boolean = false): Promise<DataMart | null> {
    return this.dataMartRepository.findOne({ where: { id }, withDeleted });
  }

  async findByProjectIdForList(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ items: DataMart[]; total: number }> {
    const qb = this.dataMartRepository
      .createQueryBuilder('dm')
      .leftJoin('dm.storage', 'storage')
      .select([
        'dm.id',
        'dm.title',
        'dm.status',
        'dm.definitionType',
        'dm.createdById',
        'dm.createdAt',
        'dm.modifiedAt',
        'storage.type',
        'storage.title',
      ])
      .addSelect(
        'CASE WHEN dm.definitionType = :connectorDefinitionType THEN dm.definition ELSE NULL END',
        'dm_definition'
      )
      .setParameter('connectorDefinitionType', DataMartDefinitionType.CONNECTOR)
      .where('dm.projectId = :projectId', { projectId })
      .andWhere('dm.deletedAt IS NULL')
      .orderBy('dm.createdAt', 'DESC')
      .addOrderBy('dm.id', 'ASC')
      .limit(options?.limit)
      .offset(options?.offset);

    const countQb = qb.clone().limit(undefined).offset(undefined);
    const [total, { raw, entities }] = await Promise.all([
      countQb.getCount(),
      qb.getRawAndEntities(),
    ]);
    const items = entities.map((item, index) => {
      if (raw[index]?.dm_definition) {
        try {
          // value can be returned as a string or as an object
          const rawDefinition = raw[index].dm_definition;
          const parsed =
            typeof rawDefinition === 'string' ? JSON.parse(rawDefinition) : rawDefinition;
          const result = DataMartDefinitionSchema.safeParse(parsed);
          if (result.success) {
            item.definition = result.data;
          } else {
            this.logger.error(
              `Invalid definition schema for DataMart ${item.id}: ${result.error.message}`
            );
            item.definition = undefined;
          }
        } catch (error) {
          this.logger.error(`Failed to parse definition for DataMart ${item.id}`, error);
          item.definition = undefined;
        }
      }
      return item;
    });
    return { items, total };
  }

  async findByProjectIdAndDefinitionType(
    projectId: string,
    definitionType: DataMartDefinitionType
  ): Promise<DataMart[]> {
    return this.dataMartRepository.find({ where: { projectId, definitionType } });
  }

  async findByStorage(storage: DataStorage): Promise<DataMart[]> {
    return this.dataMartRepository.find({ where: { storage: { id: storage.id } } });
  }

  async findIdsByStorage(storage: DataStorage, withDeleted = false): Promise<string[]> {
    return this.dataMartRepository
      .find({
        where: { storage: { id: storage.id } },
        select: ['id'],
        withDeleted,
      })
      .then(dms => dms.map(dm => dm.id));
  }

  async findDraftIdsByStorage(storage: DataStorage): Promise<string[]> {
    return this.dataMartRepository
      .find({
        where: { storage: { id: storage.id }, status: DataMartStatus.DRAFT },
        select: ['id'],
      })
      .then(dms => dms.map(dm => dm.id));
  }

  async softDeleteByIdAndProjectId(id: string, projectId: string): Promise<void> {
    await this.dataMartRepository.softDelete({ id, projectId });
  }

  async actualizeSchema(id: string, projectId: string): Promise<DataMart> {
    const dataMart = await this.getByIdAndProjectId(id, projectId);
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
