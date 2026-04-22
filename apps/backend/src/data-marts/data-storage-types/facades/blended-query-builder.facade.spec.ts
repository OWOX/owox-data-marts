import { Test, TestingModule } from '@nestjs/testing';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { BLENDED_QUERY_BUILDER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  BlendedQueryBuilder,
  BlendedQueryContext,
} from '../interfaces/blended-query-builder.interface';
import { BlendedQueryBuilderFacade } from './blended-query-builder.facade';

describe('BlendedQueryBuilderFacade', () => {
  let facade: BlendedQueryBuilderFacade;
  let resolver: jest.Mocked<TypeResolver<DataStorageType, BlendedQueryBuilder>>;
  let builder: jest.Mocked<BlendedQueryBuilder>;

  const context: BlendedQueryContext = {
    mainTableReference: 'main_table',
    mainDataMartTitle: 'Main',
    mainDataMartUrl: 'https://example/main',
    chains: [],
    columns: [],
  };

  beforeEach(async () => {
    builder = {
      type: DataStorageType.GOOGLE_BIGQUERY,
      buildBlendedQuery: jest.fn().mockReturnValue('WITH main AS (...)'),
    };
    resolver = {
      resolve: jest.fn().mockResolvedValue(builder),
    } as unknown as jest.Mocked<TypeResolver<DataStorageType, BlendedQueryBuilder>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlendedQueryBuilderFacade,
        { provide: BLENDED_QUERY_BUILDER_RESOLVER, useValue: resolver },
      ],
    }).compile();

    facade = module.get(BlendedQueryBuilderFacade);
  });

  it('resolves the builder for the given storage type and forwards the context', async () => {
    const sql = await facade.buildBlendedQuery(DataStorageType.GOOGLE_BIGQUERY, context);

    expect(resolver.resolve).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY);
    expect(builder.buildBlendedQuery).toHaveBeenCalledWith(context);
    expect(sql).toBe('WITH main AS (...)');
  });

  it('propagates resolver errors (unregistered storage type)', async () => {
    resolver.resolve.mockRejectedValueOnce(new Error('No component found for type: UNKNOWN'));

    await expect(facade.buildBlendedQuery('UNKNOWN' as DataStorageType, context)).rejects.toThrow(
      'No component found for type'
    );
  });

  it.each([
    DataStorageType.GOOGLE_BIGQUERY,
    DataStorageType.SNOWFLAKE,
    DataStorageType.AWS_REDSHIFT,
    DataStorageType.AWS_ATHENA,
    DataStorageType.DATABRICKS,
  ])('routes by DataStorageType.%s', async type => {
    await facade.buildBlendedQuery(type, context);
    expect(resolver.resolve).toHaveBeenCalledWith(type);
  });
});
