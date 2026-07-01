import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { IdpModule } from '../../idp/idp.module';
import { DataMartsModule } from '../data-marts.module';
import { DataMart } from '../entities/data-mart.entity';
import { Context } from '../entities/context.entity';
import { DataMartContext } from '../entities/data-mart-context.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { SearchReindexTrigger } from '../entities/search/search-reindex-trigger.entity';
import {
  SearchDataDestinationProjectReindexTrigger,
  SearchDataMartProjectReindexTrigger,
  SearchDataStorageProjectReindexTrigger,
} from '../entities/search/search-project-reindex-trigger.entity';
import { SEARCH_FACADE, SEARCH_SEMANTIC_ENGINE } from '../../common/search/search.facade';
import { SearchController } from '../controllers/search.controller';
import {
  ADVANCED_SEARCH_CONFIG,
  AdvancedSearchConfig,
  loadAdvancedSearchConfig,
} from './config/advanced-search.config';
import { SEARCH_CONFIG, loadSearchConfig } from './config/search.config';
import { SearchIndexRepository } from './schema/search-index.repository';
import { DATA_MART_CATALOG } from './catalog/data-mart-catalog.port';
import { TypeOrmDataMartCatalogAdapter } from './catalog/typeorm-data-mart-catalog.adapter';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from './embedding/embedding-provider';
import { LocalTransformersEmbeddingProvider } from './embedding/local-transformers.provider';
import { OpenRouterEmbeddingProvider } from './embedding/openrouter-embedding.provider';
import { SearchIndexerService } from './indexing/search-indexer.service';
import {
  SearchDataDestinationProjectReindexTriggerHandler,
  SearchDataMartProjectReindexTriggerHandler,
  SearchDataStorageProjectReindexTriggerHandler,
  SearchEntityReindexTriggerHandler,
} from './indexing/search-reindex-trigger-handler.service';
import { SearchIndexDriftProcessor } from './indexing/search-index-drift.processor';
import { AdvancedSearchService } from './engine/advanced-search.service';
import { INDEXABLE_SOURCES } from './sources/indexable-source.port';
import { IndexableSourceRegistry } from './sources/indexable-source.registry';
import { DataMartIndexableSource } from './sources/data-mart.source';
import { DataStorageIndexableSource } from './sources/data-storage.source';
import { DataDestinationIndexableSource } from './sources/data-destination.source';
import { InMemoryPaginatedSearch } from './engine/in-memory-paginated.search';
import { VECTOR_SEARCH_PORT } from './engine/vector-search.port';
import { SearchFacadeImpl } from './search.facade.impl';

@Global()
@Module({
  imports: [
    CommonModule,
    DataMartsModule,
    IdpModule,
    TypeOrmModule.forFeature([
      DataMart,
      Context,
      DataMartContext,
      DataMartRelationship,
      DataStorage,
      DataDestination,
      SearchReindexTrigger,
      SearchDataMartProjectReindexTrigger,
      SearchDataStorageProjectReindexTrigger,
      SearchDataDestinationProjectReindexTrigger,
    ]),
  ],
  providers: [
    {
      provide: SEARCH_CONFIG,
      useFactory: () => loadSearchConfig(process.env as Record<string, string | undefined>),
    },
    {
      provide: ADVANCED_SEARCH_CONFIG,
      useFactory: () => loadAdvancedSearchConfig(process.env as Record<string, string | undefined>),
    },
    SearchIndexRepository,
    { provide: DATA_MART_CATALOG, useClass: TypeOrmDataMartCatalogAdapter },
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (config: AdvancedSearchConfig): EmbeddingProvider => {
        if (config.embeddingProvider === 'openrouter') {
          return new OpenRouterEmbeddingProvider(config);
        }
        return new LocalTransformersEmbeddingProvider(config);
      },
      inject: [ADVANCED_SEARCH_CONFIG],
    },
    SearchIndexerService,
    SearchEntityReindexTriggerHandler,
    SearchDataMartProjectReindexTriggerHandler,
    SearchDataStorageProjectReindexTriggerHandler,
    SearchDataDestinationProjectReindexTriggerHandler,
    SearchIndexDriftProcessor,
    DataMartIndexableSource,
    DataStorageIndexableSource,
    DataDestinationIndexableSource,
    {
      provide: INDEXABLE_SOURCES,
      useFactory: (
        dataMartSource: DataMartIndexableSource,
        dataStorageSource: DataStorageIndexableSource,
        dataDestinationSource: DataDestinationIndexableSource
      ) => [dataMartSource, dataStorageSource, dataDestinationSource],
      inject: [DataMartIndexableSource, DataStorageIndexableSource, DataDestinationIndexableSource],
    },
    IndexableSourceRegistry,
    InMemoryPaginatedSearch,
    { provide: VECTOR_SEARCH_PORT, useExisting: InMemoryPaginatedSearch },
    AdvancedSearchService,
    { provide: SEARCH_SEMANTIC_ENGINE, useExisting: AdvancedSearchService },
    { provide: SEARCH_FACADE, useClass: SearchFacadeImpl },
  ],
  controllers: [SearchController],
  exports: [SEARCH_FACADE, SEARCH_SEMANTIC_ENGINE],
})
export class SearchModule {}
