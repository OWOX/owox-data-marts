import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartQueryBuilder } from '../interfaces/data-mart-query-builder.interface';
import { DataMartQueryBuilderFacade } from './data-mart-query-builder.facade';

describe('DataMartQueryBuilderFacade', () => {
  const definition = { connector: {} } as unknown as DataMartDefinition;

  const build = () => {
    const builder = { buildQuery: jest.fn().mockReturnValue('SELECT 1') };
    const resolver = { resolve: jest.fn().mockResolvedValue(builder) };
    const facade = new DataMartQueryBuilderFacade(
      resolver as unknown as TypeResolver<DataStorageType, DataMartQueryBuilder>
    );
    return { facade, builder, resolver };
  };

  // An OWOX Storage runs its jobs in another project than its datasets.
  it('gives a BigQuery builder the project of the storage', async () => {
    const { facade, builder, resolver } = build();

    await facade.buildQuery(
      { type: DataStorageType.GOOGLE_BIGQUERY, config: { projectId: 'owox-p-storage-001' } },
      definition,
      { limit: 5 }
    );

    expect(resolver.resolve).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY);
    expect(builder.buildQuery).toHaveBeenCalledWith(definition, {
      limit: 5,
      storageProjectId: 'owox-p-storage-001',
    });
  });

  it('passes the options of another storage type unchanged', async () => {
    const { facade, builder } = build();

    await facade.buildQuery(
      { type: DataStorageType.SNOWFLAKE, config: { account: 'acc' } },
      definition,
      { limit: 5 }
    );

    expect(builder.buildQuery).toHaveBeenCalledWith(definition, { limit: 5 });
  });
});
