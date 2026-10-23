import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type JsonSchemaType } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { z } from 'zod-v4';
import type { PublicOriginService } from '../../../../common/config/public-origin.service';
import { DataMartSchemaSchema } from '../../../../data-marts/data-storage-types/data-mart-schema.type';
import { McpConfigService } from '../../config/mcp.config';
import { McpSdkServerFactory } from '../../sdk/mcp-sdk-server.factory';
import { makeMcpOutputSchema } from '../../sdk/mcp-output-schema';
import { McpToolRegistry } from '../mcp-tool.registry';
import { GetDataMartConfigurationTool } from './get-data-mart-configuration.tool';
import { UpdateDataMartDefinitionTool } from './update-data-mart-definition.tool';
import { UpdateDataMartMetadataTool } from './update-data-mart-metadata.tool';
import { UpdateDataMartSchemaTool } from './update-data-mart-schema.tool';
import { dataMartConfigurationSchema } from './data-mart-configuration.schemas';

const validator = new AjvJsonSchemaValidator();
const storageSchemas = [
  {
    type: 'bigquery-data-mart-schema',
    fields: [{ name: 'country', type: 'STRING', mode: 'NULLABLE' }],
  },
  { type: 'snowflake-data-mart-schema', fields: [{ name: 'country', type: 'STRING' }] },
  { type: 'athena-data-mart-schema', fields: [{ name: 'country', type: 'VARCHAR' }] },
  { type: 'redshift-data-mart-schema', fields: [{ name: 'country', type: 'VARCHAR' }] },
  {
    type: 'databricks-data-mart-schema',
    table: 'catalog.schema.orders',
    fields: [{ name: 'country', type: 'STRING' }],
  },
];

describe('Configuration schemas advertised to MCP clients', () => {
  const schemaTool = new UpdateDataMartSchemaTool({} as never);
  const checkSchema = (schema: unknown) =>
    validator.getValidator(
      z.toJSONSchema(z.object(schemaTool.zodSchema), { io: 'input' }) as JsonSchemaType
    )({
      data_mart_id: 'mart-1',
      schema,
    }).valid;

  it.each(storageSchemas)(
    'accepts real $type input and rejects unsupported field types',
    schema => {
      expect(DataMartSchemaSchema.safeParse(schema).success).toBe(true);
      expect(checkSchema(schema)).toBe(true);
      const invalid = {
        ...schema,
        fields: [{ ...schema.fields[0], type: 'NOT_A_WAREHOUSE_TYPE' }],
      };
      expect(DataMartSchemaSchema.safeParse(invalid).success).toBe(false);
      expect(checkSchema(invalid)).toBe(false);
    }
  );

  it('advertises required BigQuery mode and checks recursive children', () => {
    expect(
      checkSchema({
        type: 'bigquery-data-mart-schema',
        fields: [{ name: 'country', type: 'STRING' }],
      })
    ).toBe(false);
    const nested = {
      type: 'bigquery-data-mart-schema',
      fields: [
        {
          name: 'customer',
          type: 'RECORD',
          mode: 'NULLABLE',
          fields: [{ name: 'country', type: 'STRING', mode: 'REQUIRED' }],
        },
      ],
    };
    expect(checkSchema(nested)).toBe(true);
    nested.fields[0].fields[0].mode = 'INVALID';
    expect(checkSchema(nested)).toBe(false);
  });

  it('requires Databricks table and rejects unknown aggregation functions', () => {
    expect(checkSchema({ type: 'databricks-data-mart-schema', fields: [] })).toBe(false);
    expect(
      checkSchema({
        type: 'athena-data-mart-schema',
        fields: [{ name: 'country', type: 'VARCHAR', allowedAggregations: ['NOT_AN_AGGREGATE'] }],
      })
    ).toBe(false);
  });

  it('checks nested Snowflake types without losing unknown field metadata on round trips', () => {
    const schema = {
      type: 'snowflake-data-mart-schema',
      fields: [
        {
          name: 'customer',
          type: 'VARIANT',
          fields: [{ name: 'country', type: 'STRING', futureMetadata: { keep: true } }],
        },
      ],
    };
    expect(checkSchema(schema)).toBe(true);
    expect(schemaTool.parseInput({ data_mart_id: 'mart-1', schema }).schema).toEqual(schema);
    schema.fields[0].fields[0].type = 'NOT_A_WAREHOUSE_TYPE';
    expect(checkSchema(schema)).toBe(false);
  });

  it.each([
    { type: 'SQL', sqlQuery: 'SELECT 1' },
    { type: 'TABLE', fullyQualifiedName: 'project.dataset.orders' },
    { type: 'VIEW', fullyQualifiedName: 'project.dataset.orders_view' },
    { type: 'TABLE_PATTERN', pattern: 'project.dataset.orders_*' },
    {
      type: 'CONNECTOR',
      connector: {
        source: {
          name: 'Stripe',
          configuration: [{ account: 'account-1' }],
          node: 'charges',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'project.dataset.charges' },
      },
    },
  ])('advertises the matching $type definition body', definition => {
    const tool = new UpdateDataMartDefinitionTool({} as never);
    const input = { data_mart_id: 'mart-1', definition };
    const check = validator.getValidator(
      z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' }) as JsonSchemaType
    );
    expect(check(input).valid).toBe(true);
    expect(() => tool.parseInput(input)).not.toThrow();
    const invalid = {
      data_mart_id: 'mart-1',
      definition: { type: definition.type, unrelated: true },
    };
    expect(check(invalid).valid).toBe(false);
    expect(() => tool.parseInput(invalid)).toThrow();
  });

  it('rejects unstructured definition, schema and blended settings in configuration output', () => {
    const json = makeMcpOutputSchema({ data_mart: dataMartConfigurationSchema })[
      '~standard'
    ].jsonSchema.output({ target: 'draft-2020-12' });
    const check = validator.getValidator(json);
    const dataMart = {
      id: 'mart-1',
      title: 'Orders',
      status: 'DRAFT',
      storage: { id: 'storage-1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' },
      definitionType: 'SQL',
      definition: { sqlQuery: 'SELECT 1' },
      description: null,
      icon: null,
      schema: storageSchemas[0],
      businessOwnerIds: [],
      technicalOwnerIds: [],
      availableForReporting: false,
      availableForMaintenance: false,
      contexts: [],
      blendedFieldsConfig: {
        sources: [
          { path: 'orders', alias: 'Orders', fields: { amount: { aggregateFunction: 'SUM' } } },
        ],
      },
      createdAt: '2026-10-21T00:00:00.000Z',
      modifiedAt: '2026-10-21T00:00:00.000Z',
    };
    expect(check({ data_mart: dataMart }).valid).toBe(true);
    for (const key of ['definition', 'schema', 'blendedFieldsConfig']) {
      expect(check({ data_mart: { ...dataMart, [key]: { unrelated: true } } }).valid).toBe(false);
    }
  });

  it('publishes warehouse variants and typed nested output through the actual SDK', async () => {
    const metadataFacade = { updateDataMartMetadata: jest.fn() };
    const tools = [
      schemaTool,
      new UpdateDataMartDefinitionTool({} as never),
      new UpdateDataMartMetadataTool(metadataFacade as never),
      new GetDataMartConfigurationTool(
        {
          getDataMart: async () => ({
            id: 'mart-1',
            title: 'Orders',
            status: 'DRAFT',
            storage: { id: 'storage-1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' },
            definitionType: 'SQL',
            definition: { sqlQuery: 'SELECT 1' },
            description: null,
            icon: null,
            schema: { ...storageSchemas[0], futureSchemaMetadata: { keep: true } },
            businessOwnerIds: [],
            technicalOwnerIds: [],
            availableForReporting: false,
            availableForMaintenance: false,
            contexts: [],
            blendedFieldsConfig: {
              sources: [
                {
                  path: 'orders',
                  alias: 'Orders',
                  futureSourceMetadata: true,
                  fields: { country: { alias: 'Country', futureOverrideMetadata: true } },
                },
              ],
              futureBlendMetadata: true,
            },
            createdAt: '2026-10-21T00:00:00.000Z',
            modifiedAt: '2026-10-21T00:00:00.000Z',
          }),
        } as never,
        {
          getPublicOrigin: () => 'https://app.owox.com',
        } as PublicOriginService
      ),
    ];
    const factory = new McpSdkServerFactory(
      new McpConfigService({ get: () => undefined } as never),
      new McpToolRegistry(tools),
      { wrap: (_name: string, handler: unknown) => handler } as never
    );
    const server = factory.create({
      clientId: 'client-1',
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['admin'],
      scopes: ['mcp:read', 'mcp:write'],
      resource: 'https://mcp.example/mcp',
      authFlow: 'mcp',
    });
    const client = new Client({ name: 'configuration-schema-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const catalog = await client.listTools();
      const update = catalog.tools.find(tool => tool.name === 'update_data_mart_schema')!;
      const check = validator.getValidator(update.inputSchema as JsonSchemaType);
      expect(
        check({
          data_mart_id: 'mart-1',
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [{ name: 'country', type: 'STRING' }],
          },
        }).valid
      ).toBe(false);
      const result = await client.callTool({
        name: 'get_data_mart_configuration',
        arguments: { data_mart_id: 'mart-1' },
      });
      expect(result.structuredContent).toMatchObject({
        setup_url: 'https://app.owox.com/ui/project-1/data-marts/mart-1/data-setup',
        next_steps: expect.arrayContaining([
          expect.stringContaining('validate_data_mart_definition'),
        ]),
      });
      expect(result.structuredContent).toMatchObject({
        data_mart: {
          definition: { sqlQuery: 'SELECT 1' },
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [{ name: 'country', type: 'STRING', mode: 'NULLABLE' }],
            futureSchemaMetadata: { keep: true },
          },
          blendedFieldsConfig: {
            sources: [
              {
                path: 'orders',
                alias: 'Orders',
                futureSourceMetadata: true,
                fields: { country: { alias: 'Country', futureOverrideMetadata: true } },
              },
            ],
            futureBlendMetadata: true,
          },
        },
      });
      const metadata = catalog.tools.find(tool => tool.name === 'update_data_mart_metadata')!;
      expect(metadata.inputSchema.required).toEqual(['data_mart_id']);
      expect(Object.keys(metadata.inputSchema.properties!)).toEqual([
        'data_mart_id',
        'title',
        'description',
        'icon',
      ]);
      const checkMetadata = validator.getValidator(metadata.inputSchema as JsonSchemaType);
      for (const properties of [{ title: 'Revenue' }, { description: null }, { icon: null }]) {
        expect(checkMetadata({ data_mart_id: 'mart-1', ...properties }).valid).toBe(true);
      }
      for (const properties of [{ title: null }, { description: '' }, { icon: 'invalid-icon' }]) {
        expect(checkMetadata({ data_mart_id: 'mart-1', ...properties }).valid).toBe(false);
      }
      const emptyPatch = await client.callTool({
        name: 'update_data_mart_metadata',
        arguments: { data_mart_id: 'mart-1' },
      });
      expect(emptyPatch.isError).toBe(true);
      expect(metadataFacade.updateDataMartMetadata).not.toHaveBeenCalled();
      const configuration = z
        .object({ data_mart: dataMartConfigurationSchema })
        .parse(result.structuredContent);
      metadataFacade.updateDataMartMetadata.mockResolvedValue(configuration.data_mart);
      const updated = await client.callTool({
        name: 'update_data_mart_metadata',
        arguments: { data_mart_id: 'mart-1', description: null, icon: null },
      });
      expect(updated.isError).not.toBe(true);
      expect(
        z.object({ data_mart: dataMartConfigurationSchema }).parse(updated.structuredContent)
          .data_mart
      ).toEqual(configuration.data_mart);
      expect(metadataFacade.updateDataMartMetadata).toHaveBeenCalledWith(
        { projectId: 'project-1', userId: 'user-1', roles: ['admin'] },
        { dataMartId: 'mart-1', description: null, icon: null }
      );
      for (const schema of storageSchemas)
        expect(check({ data_mart_id: 'mart-1', schema }).valid).toBe(true);
      const definition = catalog.tools.find(tool => tool.name === 'update_data_mart_definition')!;
      expect(
        validator.getValidator(definition.inputSchema as JsonSchemaType)({
          data_mart_id: 'mart-1',
          definition: { type: 'SQL', fullyQualifiedName: 'project.dataset.orders' },
        }).valid
      ).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
