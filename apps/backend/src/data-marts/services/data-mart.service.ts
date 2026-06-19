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
import { OwnerFilter } from '../enums/owner-filter.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { buildContextGateSql } from '../utils/build-context-gate-sql';

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
      relations: [
        'connectorState',
        'storage',
        'storage.credential',
        'businessOwners',
        'technicalOwners',
        'contexts',
        'contexts.context',
      ],
    });

    if (!entity) {
      throw new NotFoundException(`Data Mart with id ${id} and projectId ${projectId} not found`);
    }

    return entity;
  }

  async findById(id: string, withDeleted: boolean = false): Promise<DataMart | null> {
    return this.dataMartRepository.findOne({ where: { id }, withDeleted });
  }

  async findByProjectIdForList(
    projectId: string,
    options?: {
      limit?: number;
      offset?: number;
      ownerFilter?: OwnerFilter;
      userId?: string;
      roles?: string[];
      roleScope?: RoleScope;
    }
  ): Promise<{ items: DataMart[]; total: number }> {
    const DM_ALIAS = 'dm';
    const RAW_ID_COL = `${DM_ALIAS}_id`; // TypeORM raw alias for dm.id
    const RAW_DEFINITION_COL = 'dm_definition'; // explicit alias in addSelect below

    const qb = this.dataMartRepository
      .createQueryBuilder(DM_ALIAS)
      .leftJoin('dm.storage', 'storage')
      .leftJoinAndSelect('dm.businessOwners', 'businessOwners')
      .leftJoinAndSelect('dm.technicalOwners', 'technicalOwners')
      .leftJoinAndSelect('dm.contexts', 'dmContexts')
      .leftJoinAndSelect('dmContexts.context', 'dmContext')
      .select([
        'dm.id',
        'dm.title',
        'dm.status',
        'dm.definitionType',
        'dm.createdById',
        'dm.createdAt',
        'dm.modifiedAt',
        'dm.availableForReporting',
        'dm.availableForMaintenance',
        'storage.type',
        'storage.title',
        'businessOwners.userId',
        'technicalOwners.userId',
        'dmContexts.dataMartId',
        'dmContexts.contextId',
        'dmContext.id',
        'dmContext.name',
      ])
      .addSelect(
        'CASE WHEN dm.definitionType = :connectorDefinitionType THEN dm.definition ELSE NULL END',
        RAW_DEFINITION_COL
      )
      .setParameter('connectorDefinitionType', DataMartDefinitionType.CONNECTOR)
      .where('dm.projectId = :projectId', { projectId })
      .andWhere('dm.deletedAt IS NULL');

    // Access filtering: non-admin sees only owned + shared
    const isAdmin = options?.roles?.includes('admin');
    if (!isAdmin && options?.userId) {
      const isTu = options.roles?.includes('editor');
      const roleScope: RoleScope = options?.roleScope ?? RoleScope.ENTIRE_PROJECT;
      const contextGate = buildContextGateSql({
        joinTable: 'data_mart_contexts',
        entityIdColumn: 'data_mart_id',
        entityAlias: 'dm',
      });
      const sharedClause = isTu
        ? `(dm.availableForReporting = :isTrue OR dm.availableForMaintenance = :isTrue)`
        : `dm.availableForReporting = :isTrue`;
      qb.andWhere(
        `(
          EXISTS (SELECT 1 FROM data_mart_technical_owners t WHERE t.data_mart_id = dm.id AND t.user_id = :userId)
          OR EXISTS (SELECT 1 FROM data_mart_business_owners b WHERE b.data_mart_id = dm.id AND b.user_id = :userId)
          OR (
            ${sharedClause}
            AND ${contextGate}
          )
        )`,
        {
          userId: options.userId,
          isTrue: true,
          roleScope,
          entireProjectScope: RoleScope.ENTIRE_PROJECT,
          projectId,
        }
      );
    }

    if (options?.ownerFilter === OwnerFilter.HAS_OWNERS) {
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM data_mart_technical_owners t WHERE t.data_mart_id = dm.id)
          OR EXISTS (SELECT 1 FROM data_mart_business_owners b WHERE b.data_mart_id = dm.id))`
      );
    } else if (options?.ownerFilter === OwnerFilter.NO_OWNERS) {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM data_mart_technical_owners t WHERE t.data_mart_id = dm.id)
         AND NOT EXISTS (SELECT 1 FROM data_mart_business_owners b WHERE b.data_mart_id = dm.id)`
      );
    }

    qb.orderBy('dm.createdAt', 'DESC')
      .addOrderBy('dm.id', 'ASC')
      .take(options?.limit)
      .skip(options?.offset);

    const countQb = qb.clone().take(undefined).skip(undefined);
    const [total, { raw, entities }] = await Promise.all([
      countQb.getCount(),
      qb.getRawAndEntities(),
    ]);
    // raw has one row per JOIN combination (multiple rows per entity when owners/contexts exist),
    // so index-based matching is wrong. Build a map keyed by data mart ID instead.
    const rawDefinitionById = new Map<string, unknown>();
    for (const row of raw) {
      if (row[RAW_ID_COL] && row[RAW_DEFINITION_COL] && !rawDefinitionById.has(row[RAW_ID_COL])) {
        rawDefinitionById.set(row[RAW_ID_COL], row[RAW_DEFINITION_COL]);
      }
    }
    const items = entities.map(item => {
      const rawDefinition = rawDefinitionById.get(item.id);
      if (rawDefinition) {
        try {
          // value can be returned as a string or as an object
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

  async actualizeSchemaIfExpired(
    id: string,
    projectId: string,
    expiresAfterMs: number
  ): Promise<DataMart> {
    const dataMart = await this.getByIdAndProjectId(id, projectId);
    if (!this.isSchemaExpired(dataMart, expiresAfterMs)) {
      return dataMart;
    }

    await this.actualizeSchemaInEntity(dataMart);
    await this.dataMartRepository.save(dataMart);
    return dataMart;
  }

  async actualizeSchemaInEntityIfExpired(
    dataMart: DataMart,
    expiresAfterMs: number
  ): Promise<DataMart> {
    if (!this.isSchemaExpired(dataMart, expiresAfterMs)) {
      return dataMart;
    }
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
    dataMart.schemaActualizedAt = new Date();

    return dataMart;
  }

  private isSchemaExpired(dataMart: DataMart, expiresAfterMs: number): boolean {
    if (!dataMart.schemaActualizedAt) {
      return true;
    }

    return Date.now() - dataMart.schemaActualizedAt.getTime() >= expiresAfterMs;
  }

  async save(dataMart: DataMart): Promise<DataMart> {
    return this.dataMartRepository.save(dataMart);
  }
}
