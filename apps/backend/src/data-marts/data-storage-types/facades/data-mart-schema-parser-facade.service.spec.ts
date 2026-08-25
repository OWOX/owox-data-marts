import { Test, TestingModule } from '@nestjs/testing';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DATA_MART_SCHEMA_PARSER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../interfaces/data-mart-schema-parser.interface';
import { DataMartSchemaFieldStatus } from '../enums/data-mart-schema-field-status.enum';
import { BigQueryFieldType } from '../bigquery/enums/bigquery-field-type.enum';
import { BigQueryFieldMode } from '../bigquery/enums/bigquery-field-mode.enum';
import { BigQueryDataMartSchemaType } from '../bigquery/schemas/bigquery-data-mart.schema';
import { DataMartSchemaParserFacade } from './data-mart-schema-parser-facade.service';
import type { DataMartSchema } from '../data-mart-schema.type';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';

describe('DataMartSchemaParserFacade — calculated fields must be top-level', () => {
  let facade: DataMartSchemaParserFacade;
  let resolver: jest.Mocked<TypeResolver<DataStorageType, DataMartSchemaParser>>;

  const schema = (fields: Record<string, unknown>[]): DataMartSchema =>
    ({ type: BigQueryDataMartSchemaType, fields }) as unknown as DataMartSchema;

  async function setupWith(parsedSchema: DataMartSchema): Promise<void> {
    const parser: jest.Mocked<DataMartSchemaParser> = {
      type: DataStorageType.GOOGLE_BIGQUERY,
      validateAndParse: jest.fn().mockResolvedValue(parsedSchema),
    };
    resolver = {
      resolve: jest.fn().mockResolvedValue(parser),
    } as unknown as jest.Mocked<TypeResolver<DataStorageType, DataMartSchemaParser>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartSchemaParserFacade,
        { provide: DATA_MART_SCHEMA_PARSER_RESOLVER, useValue: resolver },
      ],
    }).compile();

    facade = module.get(DataMartSchemaParserFacade);
  }

  it('rejects a calculated field nested inside a RECORD', async () => {
    await setupWith(
      schema([
        {
          name: 'metrics',
          type: BigQueryFieldType.RECORD,
          mode: BigQueryFieldMode.NULLABLE,
          status: DataMartSchemaFieldStatus.CONNECTED,
          fields: [
            {
              name: 'ctr',
              type: BigQueryFieldType.FLOAT,
              mode: BigQueryFieldMode.NULLABLE,
              status: DataMartSchemaFieldStatus.CONNECTED,
              calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
            },
          ],
        },
      ])
    );

    await expect(facade.validateAndParse({}, DataStorageType.GOOGLE_BIGQUERY)).rejects.toThrow(
      /ctr.*top-level/
    );
  });

  it('accepts a calculated field declared at the top level', async () => {
    const parsed = schema([
      {
        name: 'ctr',
        type: BigQueryFieldType.FLOAT,
        mode: BigQueryFieldMode.NULLABLE,
        status: DataMartSchemaFieldStatus.CONNECTED,
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
    ]);
    await setupWith(parsed);

    await expect(facade.validateAndParse({}, DataStorageType.GOOGLE_BIGQUERY)).resolves.toEqual(
      parsed
    );
  });
});

/**
 * A name is what every consumer keys a field by — the report's `columnConfig`, the composer's
 * `byName`, a `{{ref}}` tag, the validator's `derivedLevels`. All four are last-wins Maps, so two
 * top-level fields under one name make the answer depend on schema order, which the analyst
 * controls by dragging a row. The type is the visible half of that: a calculated field declared
 * FLOAT behind a STRING column of the same name is CAST as a STRING before an aggregation reads it.
 */
describe('DataMartSchemaParserFacade — a calculated field owns its name', () => {
  let facade: DataMartSchemaParserFacade;

  const schema = (fields: Record<string, unknown>[]): DataMartSchema =>
    ({ type: BigQueryDataMartSchemaType, fields }) as unknown as DataMartSchema;

  const column = (name: string, type: BigQueryFieldType = BigQueryFieldType.STRING) => ({
    name,
    type,
    mode: BigQueryFieldMode.NULLABLE,
    status: DataMartSchemaFieldStatus.CONNECTED,
  });

  const calculated = (name: string) => ({
    ...column(name, BigQueryFieldType.FLOAT),
    calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
  });

  async function setupWith(parsedSchema: DataMartSchema): Promise<void> {
    const parser: jest.Mocked<DataMartSchemaParser> = {
      type: DataStorageType.GOOGLE_BIGQUERY,
      validateAndParse: jest.fn().mockResolvedValue(parsedSchema),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartSchemaParserFacade,
        {
          provide: DATA_MART_SCHEMA_PARSER_RESOLVER,
          useValue: { resolve: jest.fn().mockResolvedValue(parser) },
        },
      ],
    }).compile();
    facade = module.get(DataMartSchemaParserFacade);
  }

  const save = () => facade.validateAndParse({}, DataStorageType.GOOGLE_BIGQUERY);

  // Deleting the collision check leaves this save clean and the declared FLOAT unreachable: the
  // physical STRING column is what `byName` answers with, so the report CASTs to STRING.
  it('refuses a calculated field that takes a physical column’s name', async () => {
    await setupWith(schema([column('revenue'), calculated('revenue')]));

    await expect(save()).rejects.toThrow(/revenue/);
  });

  // Order-independence is the whole point: reversing the two rows must not change the verdict.
  it('refuses it whichever row comes first', async () => {
    await setupWith(schema([calculated('revenue'), column('revenue')]));

    await expect(save()).rejects.toThrow(/revenue/);
  });

  // Two formulas under one name break `substitutableFieldsByName` the same way — a `{{ref}}` to
  // `revenue` resolves to whichever of them the Map saw last.
  it('refuses two calculated fields sharing one name', async () => {
    await setupWith(schema([calculated('revenue'), calculated('revenue')]));

    await expect(save()).rejects.toThrow(/revenue/);
  });

  // A nested `metrics.revenue` is a different PATH, so it never collides with a top-level one.
  it('leaves a nested field of the same leaf name alone', async () => {
    const parsed = schema([
      {
        ...column('metrics', BigQueryFieldType.RECORD),
        fields: [column('revenue')],
      },
      calculated('revenue'),
    ]);
    await setupWith(parsed);

    await expect(save()).resolves.toEqual(parsed);
  });

  // Two PHYSICAL columns sharing a name is not this feature's input surface — those names come
  // from the warehouse, and refusing them would block a save that has nothing to do with a
  // formula.
  it('leaves two physical columns of one name alone', async () => {
    const parsed = schema([column('revenue'), column('revenue')]);
    await setupWith(parsed);

    await expect(save()).resolves.toEqual(parsed);
  });
});

/**
 * The name is also an OUTPUT IDENTIFIER: it is rendered as `AS <escaped name>` in the generated
 * SQL. Before this feature every name came from the warehouse; a calculated field's comes from a
 * person, so the characters no dialect's escaper can represent have to be refused at save time
 * rather than becoming a query that cannot parse.
 */
describe('DataMartSchemaParserFacade — a calculated field’s name must be renderable', () => {
  let facade: DataMartSchemaParserFacade;

  const schemaWithName = (name: string): DataMartSchema =>
    ({
      type: BigQueryDataMartSchemaType,
      fields: [
        {
          name,
          type: BigQueryFieldType.FLOAT,
          mode: BigQueryFieldMode.NULLABLE,
          status: DataMartSchemaFieldStatus.CONNECTED,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
        },
      ],
    }) as unknown as DataMartSchema;

  async function setupWith(parsedSchema: DataMartSchema): Promise<void> {
    const parser: jest.Mocked<DataMartSchemaParser> = {
      type: DataStorageType.GOOGLE_BIGQUERY,
      validateAndParse: jest.fn().mockResolvedValue(parsedSchema),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartSchemaParserFacade,
        {
          provide: DATA_MART_SCHEMA_PARSER_RESOLVER,
          useValue: { resolve: jest.fn().mockResolvedValue(parser) },
        },
      ],
    }).compile();
    facade = module.get(DataMartSchemaParserFacade);
  }

  const save = () => facade.validateAndParse({}, DataStorageType.GOOGLE_BIGQUERY);

  // Each case names the mutation it catches: drop that character from the refused set and the
  // save goes through, producing the SQL described beside it.
  it.each([
    // Every dialect's escaper splits on `.` into qualifiers, which is not an output alias anywhere.
    ['a.b', 'a dot'],
    // BigQuery/Databricks quote with a backtick, so one inside ends the identifier early.
    ['a`b', 'a backtick'],
    // Athena/Redshift/Snowflake quote with `"`, and it is also what a {{ref}} tag quotes with.
    ['a"b', 'a double quote'],
    // BigQuery reads a backslash inside a quoted identifier as an escape sequence.
    ['a\\b', 'a backslash'],
    // A newline in an output alias survives no dialect's quoting intact.
    ['a\nb', 'a newline'],
  ])('refuses %j — %s', async name => {
    await setupWith(schemaWithName(name));

    await expect(save()).rejects.toThrow(BusinessViolationException);
  });

  // The refusal has to say WHICH field, or an analyst with a dozen formulas has to find it.
  it('names the field it refuses', async () => {
    await setupWith(schemaWithName('cost.per.click'));

    await expect(save()).rejects.toThrow(/cost\.per\.click/);
  });

  // Everything a quoted identifier renders unchanged on all five stays legal — the constraint is
  // "what the escapers can represent", not a new identifier grammar.
  it.each([['click_through_rate'], ['Cost per click'], ['коэффициент'], ['ctr%'], ['ctr-2026']])(
    'accepts %j',
    async name => {
      const parsed = schemaWithName(name);
      await setupWith(parsed);

      await expect(save()).resolves.toEqual(parsed);
    }
  );

  // A physical column's name still comes from the warehouse, and Redshift and Snowflake both
  // permit a dot inside a quoted one — refusing it here would block a save of a schema OWOX did
  // not author.
  it('leaves a physical column carrying the same character alone', async () => {
    const parsed = {
      type: BigQueryDataMartSchemaType,
      fields: [
        {
          name: 'a.b',
          type: BigQueryFieldType.STRING,
          mode: BigQueryFieldMode.NULLABLE,
          status: DataMartSchemaFieldStatus.CONNECTED,
        },
      ],
    } as unknown as DataMartSchema;
    await setupWith(parsed);

    await expect(save()).resolves.toEqual(parsed);
  });
});

/**
 * The output Primary Key is written into the query as COLUMN NAMES — `renderCountDistinctPrimaryKey`
 * puts each one through a plain `ColumnRefResolver`, never through the calculated-field expansion —
 * so a calculated field in it asks the warehouse for a column that does not exist.
 *
 * The web hides the checkbox on a calculated row, which left this reachable only over the API, where
 * nothing refused it: the schema DTO carries no nested validation and `isPrimaryKey` is a plain
 * boolean on the field schema, so the flag was persisted rather than dropped. It then reaches Unique
 * Count, the join advertisement and the blended fan-out dedup alike, and the report saves clean and
 * fails on every run.
 */
describe('DataMartSchemaParserFacade — a calculated field cannot be part of the Primary Key', () => {
  let facade: DataMartSchemaParserFacade;

  const schema = (fields: Record<string, unknown>[]): DataMartSchema =>
    ({ type: BigQueryDataMartSchemaType, fields }) as unknown as DataMartSchema;

  async function setupWith(parsedSchema: DataMartSchema): Promise<void> {
    const parser: jest.Mocked<DataMartSchemaParser> = {
      type: DataStorageType.GOOGLE_BIGQUERY,
      validateAndParse: jest.fn().mockResolvedValue(parsedSchema),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartSchemaParserFacade,
        {
          provide: DATA_MART_SCHEMA_PARSER_RESOLVER,
          useValue: { resolve: jest.fn().mockResolvedValue(parser) },
        },
      ],
    }).compile();
    facade = module.get(DataMartSchemaParserFacade);
  }

  const save = () => facade.validateAndParse({}, DataStorageType.GOOGLE_BIGQUERY);

  const calculated = (over: Record<string, unknown> = {}) => ({
    name: 'session_key',
    type: BigQueryFieldType.STRING,
    mode: BigQueryFieldMode.NULLABLE,
    status: DataMartSchemaFieldStatus.CONNECTED,
    calculated: {
      formula: 'CONCAT({{ref field="part_a"}}, {{ref field="part_b"}})',
      level: 'column',
    },
    ...over,
  });

  it('refuses it, naming the field', async () => {
    await setupWith(schema([calculated({ isPrimaryKey: true })]));
    await expect(save()).rejects.toThrow(BusinessViolationException);
    await expect(save()).rejects.toThrow(/session_key.*Primary Key/);
  });

  // The aggregate level is no different: neither level owns a warehouse column.
  it('refuses an aggregate-level formula in the key too', async () => {
    await setupWith(
      schema([
        calculated({
          isPrimaryKey: true,
          calculated: { formula: 'COUNT({{ref field="clicks"}})', level: 'metric' },
        }),
      ])
    );
    await expect(save()).rejects.toThrow(/session_key.*Primary Key/);
  });

  it('leaves a physical column in the key alone', async () => {
    const parsed = schema([
      {
        name: 'order_id',
        type: BigQueryFieldType.STRING,
        mode: BigQueryFieldMode.NULLABLE,
        status: DataMartSchemaFieldStatus.CONNECTED,
        isPrimaryKey: true,
      },
      calculated(),
    ]);
    await setupWith(parsed);

    await expect(save()).resolves.toEqual(parsed);
  });
});
