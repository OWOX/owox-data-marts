import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OpenAPIObject } from '@nestjs/swagger';

jest.mock('@owox/connectors', () => ({
  // An array, not an object: connector-definition.service builds a Set from it.
  AvailableConnectors: [],
  Connectors: {},
  // The event translator reads these at import time, so an empty Core stub would break
  // the whole module graph before any test runs.
  Core: {
    EVENT_TYPE: {
      LOG: 'LOG',
      DATA: 'DATA',
      TRACE: 'TRACE',
      ANALYTICS: 'ANALYTICS',
      STATE: 'STATE',
      CONTROL: 'CONTROL',
      CREDENTIALS: 'CREDENTIALS',
      SAMPLE: 'SAMPLE',
    },
    LOG_LEVEL: { INFO: 'info', WARN: 'warn', ERROR: 'error' },
    CONTROL_ACTION: {
      STARTED: 'started',
      COMPLETED: 'completed',
      FAILED: 'failed',
      PAUSED: 'paused',
      CANCELLED: 'cancelled',
    },
    EXECUTION_STATUS: {
      IMPORT_IN_PROGRESS: 1,
      CLEANUP_IN_PROGRESS: 2,
      IMPORT_DONE: 3,
      CLEANUP_DONE: 4,
      ERROR: 5,
    },
  },
}));

jest.mock('snowflake-sdk', () => ({}));

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  ViewOnlySafe: () => () => undefined,
}));

import { ConnectorDefinitionController } from './connector-definition.controller';
import { createSwaggerDocument } from '../../config/swagger.config';

/**
 * The custom-connector builder in apps/web mirrors these payloads by hand
 * (features/connector-builder/shared/api/types.ts) with no compile-time link back to this
 * controller. These assertions are that link's stand-in: they name every field the builder
 * reads, so renaming or dropping one fails here instead of silently blanking the UI.
 */
describe('ConnectorDefinitionController OpenAPI', () => {
  const BASE = '/api/connectors/custom';
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const dependencies = [
      ...new Set<Type<unknown>>(
        Reflect.getMetadata('design:paramtypes', ConnectorDefinitionController) ?? []
      ),
    ];
    const moduleRef = await Test.createTestingModule({
      controllers: [ConnectorDefinitionController],
      providers: dependencies.map(provide => ({ provide, useValue: {} })),
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    document = createSwaggerDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  function resolveRef(ref: string): Record<string, any> {
    const schemaName = ref.split('/').at(-1)!;
    return document.components?.schemas?.[schemaName] as Record<string, any>;
  }

  function jsonSchemaOf(operation: Record<string, any> | undefined, status: string) {
    return operation?.responses?.[status]?.content?.['application/json']?.schema;
  }

  it('publishes all eleven custom-connector endpoints with their documented status codes', () => {
    const expected = [
      { path: BASE, method: 'get', handler: 'list', statuses: ['200'] },
      { path: BASE, method: 'post', handler: 'create', statuses: ['201', '400', '413'] },
      { path: `${BASE}/test`, method: 'post', handler: 'test', statuses: ['201', '400', '413'] },
      { path: `${BASE}/{id}`, method: 'get', handler: 'get', statuses: ['200', '404'] },
      {
        path: `${BASE}/{id}/versions/{version}`,
        method: 'get',
        handler: 'getVersion',
        statuses: ['200', '404'],
      },
      {
        path: `${BASE}/{id}/draft`,
        method: 'put',
        handler: 'saveDraft',
        statuses: ['200', '404', '413'],
      },
      {
        path: `${BASE}/{id}/publish`,
        method: 'post',
        handler: 'publish',
        statuses: ['201', '400', '404'],
      },
      {
        path: `${BASE}/{id}/versions/{version}/activate`,
        method: 'post',
        handler: 'activate',
        statuses: ['201', '400', '404'],
      },
      {
        path: `${BASE}/{id}`,
        method: 'delete',
        handler: 'remove',
        statuses: ['200', '400', '404'],
      },
      {
        path: `${BASE}/{id}/specification`,
        method: 'get',
        handler: 'specification',
        statuses: ['200', '404'],
      },
      { path: `${BASE}/{id}/fields`, method: 'get', handler: 'fields', statuses: ['200', '404'] },
    ];

    for (const { path, method, handler, statuses } of expected) {
      const operation = (document.paths[path] as Record<string, any> | undefined)?.[method];
      expect(operation).toBeDefined();
      expect(operation.operationId).toBe(`ConnectorDefinitionController_${handler}`);
      expect(operation.tags).toEqual(['Custom Connectors']);
      expect(typeof operation.summary).toBe('string');
      expect(operation.summary.length).toBeGreaterThan(0);
      expect(Object.keys(operation.responses).sort()).toEqual(statuses);
    }
  });

  it('publishes the list payload the builder catalogue reads', () => {
    const operation = document.paths[BASE]?.get;

    expect(jsonSchemaOf(operation as Record<string, any>, '200')).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/CustomConnectorListItemResponseApiDto' },
    });

    const itemSchema = resolveRef('#/components/schemas/CustomConnectorListItemResponseApiDto');
    expect(itemSchema.required).toEqual([
      'id',
      'name',
      'title',
      'description',
      'logo',
      'docUrl',
      'activeVersionId',
      'activeVersion',
    ]);
    expect(itemSchema.properties).toMatchObject({
      id: { type: 'string' },
      name: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string', nullable: true },
      logo: { type: 'string', nullable: true },
      docUrl: { type: 'string', nullable: true },
      activeVersionId: { type: 'string', nullable: true },
      activeVersion: { type: 'integer', nullable: true },
    });
  });

  it('publishes the detail payload carrying the version list the builder renders', () => {
    const operation = document.paths[`${BASE}/{id}`]?.get;

    expect(jsonSchemaOf(operation as Record<string, any>, '200')).toEqual({
      $ref: '#/components/schemas/CustomConnectorDetailResponseApiDto',
    });

    // The detail payload is the list item plus `versions`; the builder spreads it into the
    // same view model, so every list field has to survive here too.
    const detailSchema = resolveRef('#/components/schemas/CustomConnectorDetailResponseApiDto');
    expect(detailSchema.required).toEqual([
      'id',
      'name',
      'title',
      'description',
      'logo',
      'docUrl',
      'activeVersionId',
      'activeVersion',
      'versions',
    ]);
    expect(detailSchema.properties.versions).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/CustomConnectorVersionSummaryResponseApiDto' },
      description: 'Every version of this connector, oldest first.',
    });

    const versionSchema = resolveRef(
      '#/components/schemas/CustomConnectorVersionSummaryResponseApiDto'
    );
    expect(versionSchema.required).toEqual(['version', 'status', 'publishedAt']);
    expect(versionSchema.properties.version).toMatchObject({ type: 'integer' });
    expect(versionSchema.properties.status).toMatchObject({
      type: 'string',
      enum: ['draft', 'published'],
    });
    expect(versionSchema.properties.publishedAt).toMatchObject({
      type: 'string',
      format: 'date-time',
      nullable: true,
    });
  });

  it('publishes the version, draft, publish and activate payloads the builder writes against', () => {
    expect(
      jsonSchemaOf(
        document.paths[`${BASE}/{id}/versions/{version}`]?.get as Record<string, any>,
        '200'
      )
    ).toEqual({ $ref: '#/components/schemas/CustomConnectorVersionResponseApiDto' });
    const versionSchema = resolveRef('#/components/schemas/CustomConnectorVersionResponseApiDto');
    expect(versionSchema.required).toEqual(['version', 'status', 'manifest']);
    expect(versionSchema.properties.manifest).toMatchObject({ type: 'object' });

    expect(
      jsonSchemaOf(document.paths[`${BASE}/{id}/draft`]?.put as Record<string, any>, '200')
    ).toEqual({ $ref: '#/components/schemas/CustomConnectorVersionStateResponseApiDto' });
    const draftSchema = resolveRef(
      '#/components/schemas/CustomConnectorVersionStateResponseApiDto'
    );
    // saveDraft answers with the version state only — no publishedAt on the wire.
    expect(draftSchema.required).toEqual(['version', 'status']);
    expect(draftSchema.properties).not.toHaveProperty('publishedAt');

    expect(
      jsonSchemaOf(document.paths[`${BASE}/{id}/publish`]?.post as Record<string, any>, '201')
    ).toEqual({ $ref: '#/components/schemas/PublishCustomConnectorResponseApiDto' });
    const publishSchema = resolveRef('#/components/schemas/PublishCustomConnectorResponseApiDto');
    expect(publishSchema.required).toEqual(['version', 'status']);
    expect(publishSchema.properties.publishedAt).toMatchObject({
      type: 'string',
      format: 'date-time',
      nullable: true,
    });

    expect(
      jsonSchemaOf(
        document.paths[`${BASE}/{id}/versions/{version}/activate`]?.post as Record<string, any>,
        '201'
      )
    ).toEqual({ $ref: '#/components/schemas/ActivateCustomConnectorVersionResponseApiDto' });
    const activateSchema = resolveRef(
      '#/components/schemas/ActivateCustomConnectorVersionResponseApiDto'
    );
    expect(activateSchema.required).toEqual(['activeVersionId', 'activeVersion']);
    expect(activateSchema.properties).toMatchObject({
      activeVersionId: { type: 'string', nullable: true },
      activeVersion: { type: 'integer' },
    });
  });

  it('publishes the create, delete and test-run payloads', () => {
    expect(jsonSchemaOf(document.paths[BASE]?.post as Record<string, any>, '201')).toEqual({
      $ref: '#/components/schemas/CreateCustomConnectorResponseApiDto',
    });
    const createSchema = resolveRef('#/components/schemas/CreateCustomConnectorResponseApiDto');
    expect(createSchema.required).toEqual(['id', 'name', 'title']);

    expect(
      jsonSchemaOf(document.paths[`${BASE}/{id}`]?.delete as Record<string, any>, '200')
    ).toEqual({ $ref: '#/components/schemas/DeleteCustomConnectorResponseApiDto' });
    const deleteSchema = resolveRef('#/components/schemas/DeleteCustomConnectorResponseApiDto');
    expect(deleteSchema.required).toEqual(['success']);
    expect(deleteSchema.properties.success).toMatchObject({ type: 'boolean' });

    expect(
      jsonSchemaOf(document.paths[`${BASE}/test`]?.post as Record<string, any>, '201')
    ).toEqual({ $ref: '#/components/schemas/ConnectorTestResultResponseApiDto' });
    const testSchema = resolveRef('#/components/schemas/ConnectorTestResultResponseApiDto');
    expect(testSchema.required).toEqual(['rows', 'logs', 'error', 'sample']);
    expect(testSchema.properties.rows).toMatchObject({ type: 'array' });
    expect(testSchema.properties.logs).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect(testSchema.properties.error).toMatchObject({ type: 'string', nullable: true });
    expect(testSchema.properties.sample).toMatchObject({ type: 'array' });
  });

  it('publishes the specification and fields payloads through the shared connector schemas', () => {
    expect(
      jsonSchemaOf(document.paths[`${BASE}/{id}/specification`]?.get as Record<string, any>, '200')
    ).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/ConnectorSpecificationResponseApiDto' },
    });
    expect(
      jsonSchemaOf(document.paths[`${BASE}/{id}/fields`]?.get as Record<string, any>, '200')
    ).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/ConnectorFieldsResponseApiDto' },
    });

    // Both read an optional `version` query parameter that selects the manifest revision.
    for (const path of [`${BASE}/{id}/specification`, `${BASE}/{id}/fields`]) {
      const parameters = (
        (document.paths[path]?.get?.parameters ?? []) as Record<string, any>[]
      ).map(parameter => [parameter.name, parameter] as const);
      const byName = Object.fromEntries(parameters);
      expect(byName.version).toMatchObject({ in: 'query', required: false });
      expect(byName.id).toMatchObject({ in: 'path', required: true });
    }
  });
});
