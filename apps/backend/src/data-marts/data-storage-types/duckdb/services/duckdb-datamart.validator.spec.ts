import { DuckDbDataMartValidator } from './duckdb-datamart.validator';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { isConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';

// A minimal but *schema-valid* ConnectorDefinition: `isConnectorDefinition` runs a full
// zod parse (name/configuration/fields are all required on `source`), so fixtures missing
// those fields would silently fail the guard and fall through to the table/view branch
// instead of exercising the connector short-circuit this suite is testing.
function makeConnectorDefinition(fullyQualifiedName: string) {
  return {
    connector: {
      source: { name: 'connector', configuration: [{}], node: 'observations', fields: ['field1'] },
      storage: { fullyQualifiedName },
    },
  } as any;
}

describe('DuckDbDataMartValidator', () => {
  const v = new DuckDbDataMartValidator();

  it('has type DUCKDB', () => expect(v.type).toBe(DataStorageType.DUCKDB));

  it('accepts a connector definition (load path short-circuit)', async () => {
    const def = makeConnectorDefinition('main.orders');
    expect(isConnectorDefinition(def)).toBe(true); // sanity: fixture must hit the connector branch

    const res = await v.validate(def, {} as any, {} as any);

    expect(res.valid).toBe(true);
  });

  it('rejects a bad connector target identifier', async () => {
    const def = makeConnectorDefinition("main.o'; DROP");
    expect(isConnectorDefinition(def)).toBe(true); // sanity: fixture must hit the connector branch

    const res = await v.validate(def, {} as any, {} as any);

    expect(res.valid).toBe(false);
  });

  it('accepts a table/view definition with a valid identifier (query-path validation deferred)', async () => {
    const def = { fullyQualifiedName: 'main.orders' } as any;

    const res = await v.validate(def, {} as any, {} as any);

    expect(res.valid).toBe(true);
  });

  it('rejects a table/view definition with a bad identifier', async () => {
    const def = { fullyQualifiedName: "main.o'; DROP" } as any;

    const res = await v.validate(def, {} as any, {} as any);

    expect(res.valid).toBe(false);
  });

  it('rejects a catalog-qualified name and asks for schema.table', async () => {
    const def = { fullyQualifiedName: 'memory.main.orders' } as any;

    const res = await v.validate(def, {} as any, {} as any);

    expect(res.valid).toBe(false);
    expect(res.errorMessage).toBe('Invalid identifier format. Expected: schema.table');
  });
});
