import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ADVANCED_SEARCH_CONFIG, loadAdvancedSearchConfig } from './config/advanced-search.config';
import { EeLicenseService } from '../shared/ee-license.service';
import { CommonModule } from '../../common/common.module';
import { IdpModule } from '../../idp/idp.module';
import { DataMartsModule } from '../../data-marts/data-marts.module';
import { DataMart } from '../../data-marts/entities/data-mart.entity';
import { Context } from '../../data-marts/entities/context.entity';
import { DataMartContext } from '../../data-marts/entities/data-mart-context.entity';
import { DataMartRelationship } from '../../data-marts/entities/data-mart-relationship.entity';
import { SchemaManagerService } from './schema/schema-manager.service';
import { SearchIndexRepository } from './schema/search-index.repository';
import { DATA_MART_CATALOG } from './catalog/data-mart-catalog.port';
import { TypeOrmDataMartCatalogAdapter } from './catalog/typeorm-data-mart-catalog.adapter';
import { EMBEDDING_PROVIDER } from './embedding/embedding-provider';
import { LocalTransformersEmbeddingProvider } from './embedding/local-transformers.provider';
import { SearchIndexerService } from './indexing/search-indexer.service';
import { IndexingCron } from './indexing/indexing.cron';
import { DataMartEventsListener } from './indexing/data-mart-events.listener';
import { AdvancedSearchService } from './search/advanced-search.service';
import { AdvancedSearchFacadeImpl } from './facades/advanced-search.facade.impl';
import { ADVANCED_SEARCH_FACADE } from '../../common/ee-contracts/advanced-search.facade';
import { AdvancedSearchController } from './controllers/advanced-search.controller';

@Module({})
export class AdvancedSearchModule {
  static register(): DynamicModule {
    if (process.env['ADVANCED_SEARCH_ENABLED'] !== 'true') {
      return { module: AdvancedSearchModule };
    }

    return {
      module: AdvancedSearchModule,
      global: true,
      imports: [
        CommonModule,
        IdpModule,
        DataMartsModule,
        TypeOrmModule.forFeature([DataMart, Context, DataMartContext, DataMartRelationship]),
      ],
      providers: [
        {
          provide: ADVANCED_SEARCH_CONFIG,
          useFactory: () =>
            loadAdvancedSearchConfig(process.env as Record<string, string | undefined>),
        },
        EeLicenseService,
        SchemaManagerService,
        SearchIndexRepository,
        { provide: DATA_MART_CATALOG, useClass: TypeOrmDataMartCatalogAdapter },
        { provide: EMBEDDING_PROVIDER, useClass: LocalTransformersEmbeddingProvider },
        SearchIndexerService,
        IndexingCron,
        DataMartEventsListener,
        AdvancedSearchService,
        { provide: ADVANCED_SEARCH_FACADE, useClass: AdvancedSearchFacadeImpl },
      ],
      controllers: [AdvancedSearchController],
      exports: [ADVANCED_SEARCH_FACADE],
    };
  }
}
