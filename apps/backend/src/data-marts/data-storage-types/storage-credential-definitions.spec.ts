import type { StoredStorageCredentials } from '../entities/stored-storage-credentials.type';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../credentials/services/builtin-credential-definitions';
import { DataStorageType } from './enums/data-storage-type.enum';
import {
  STORAGE_CREDENTIAL_DEFINITION_IDS,
  changesConnectionTarget,
  sameStorageConfig,
  storableStorageConfig,
  toAdapterCredentials,
} from './storage-credential-definitions';

const serviceAccount = {
  type: 'service_account',
  project_id: 'p',
  private_key_id: 'k',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@p.iam.gserviceaccount.com',
  client_id: '1',
} as unknown as StoredStorageCredentials;

describe('changesConnectionTarget', () => {
  it.each([
    [
      DataStorageType.GOOGLE_BIGQUERY,
      { projectId: 'a', location: 'US' },
      { projectId: 'b', location: 'US' },
      true,
    ],
    [
      DataStorageType.GOOGLE_BIGQUERY,
      { projectId: 'a', location: 'US' },
      { projectId: 'a', location: 'EU' },
      false,
    ],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY, { projectId: 'a' }, { projectId: 'b' }, true],
    [
      DataStorageType.DATABRICKS,
      { host: 'a.cloud.databricks.com', httpPath: '/1' },
      { host: 'b.cloud.databricks.com', httpPath: '/1' },
      true,
    ],
    [
      DataStorageType.DATABRICKS,
      { host: 'a.cloud.databricks.com', httpPath: '/1' },
      { host: 'a.cloud.databricks.com', httpPath: '/2' },
      false,
    ],
    [
      DataStorageType.SNOWFLAKE,
      { account: 'a', warehouse: 'w' },
      { account: 'b', warehouse: 'w' },
      true,
    ],
    [
      DataStorageType.SNOWFLAKE,
      { account: 'a', warehouse: 'w' },
      { account: 'a', warehouse: 'x', role: 'r' },
      false,
    ],
    [
      DataStorageType.AWS_ATHENA,
      { region: 'a', outputBucket: 'o' },
      { region: 'b', outputBucket: 'o' },
      true,
    ],
    [
      DataStorageType.AWS_ATHENA,
      { region: 'a', outputBucket: 'o' },
      { region: 'a', outputBucket: 'p' },
      false,
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      { region: 'a', database: 'd', workgroupName: 'w' },
      { region: 'a', database: 'd', workgroupName: 'v' },
      true,
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      { region: 'a', database: 'd', clusterIdentifier: 'c' },
      { region: 'a', database: 'd', workgroupName: 'c' },
      true,
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      { region: 'a', database: 'd', workgroupName: 'w' },
      { region: 'b', database: 'd', workgroupName: 'w' },
      true,
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      { region: 'a', database: 'd', workgroupName: 'w' },
      { region: 'a', database: 'e', workgroupName: 'w' },
      false,
    ],
    [DataStorageType.SNOWFLAKE, null, { account: 'a', warehouse: 'w' }, true],
  ])('%s: %j to %j is %s', (type, before, after, expected) => {
    expect(changesConnectionTarget(type, before as never, after as never)).toBe(expected);
  });

  const provisioned = { connectionType: 'PROVISIONED', region: 'r', database: 'd' };
  const serverless = { connectionType: 'SERVERLESS', region: 'r', database: 'd' };

  it('compares the parsed configs when both parse', () => {
    const both = { clusterIdentifier: 'c1', workgroupName: 'w2' };
    const redshift = DataStorageType.AWS_REDSHIFT;
    expect(
      changesConnectionTarget(
        redshift,
        { ...provisioned, ...both } as never,
        { ...serverless, ...both } as never
      )
    ).toBe(true);
    expect(
      changesConnectionTarget(
        redshift,
        { ...provisioned, clusterIdentifier: 'c1' } as never,
        { ...provisioned, ...both } as never
      )
    ).toBe(false);
  });

  it('counts a Redshift connection type change when a config does not parse', () => {
    expect(
      changesConnectionTarget(
        DataStorageType.AWS_REDSHIFT,
        { region: 'r', database: 'd', workgroupName: 'w' } as never,
        { ...serverless, workgroupName: 'w' } as never
      )
    ).toBe(true);
  });
});

describe('storableStorageConfig', () => {
  it('drops the keys the schema drops and keeps the sent values', () => {
    expect(
      storableStorageConfig(DataStorageType.AWS_REDSHIFT, {
        connectionType: 'PROVISIONED',
        region: 'r',
        database: 'd',
        clusterIdentifier: 'c1',
        workgroupName: 'w2',
      } as never)
    ).toEqual({
      connectionType: 'PROVISIONED',
      region: 'r',
      database: 'd',
      clusterIdentifier: 'c1',
    });
    expect(
      storableStorageConfig(DataStorageType.GOOGLE_BIGQUERY, {
        projectId: 'warehouse-1',
        location: null,
      } as never)
    ).toStrictEqual({ projectId: 'warehouse-1', location: null });
  });

  it('drops keys named after Object.prototype members', () => {
    expect(
      storableStorageConfig(DataStorageType.GOOGLE_BIGQUERY, {
        projectId: 'warehouse-1',
        toString: 'x',
        hasOwnProperty: 'y',
      } as never)
    ).toStrictEqual({ projectId: 'warehouse-1' });
  });

  it('returns a config that does not parse as it is', () => {
    const config = { account: '', extra: 1 } as never;
    expect(storableStorageConfig(DataStorageType.SNOWFLAKE, config)).toBe(config);
  });
});

describe('sameStorageConfig', () => {
  // Per type: a stored config, the same config re-sent in another form, and a real change.
  it.each([
    [
      DataStorageType.GOOGLE_BIGQUERY,
      { projectId: 'warehouse-1', location: null },
      { location: 'AUTODETECT', projectId: 'warehouse-1', extra: 1 },
      { projectId: 'warehouse-1', location: 'EU' },
    ],
    [
      DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      { projectId: 'warehouse-1' },
      { projectId: 'warehouse-1', location: undefined },
      { projectId: 'warehouse-1', location: 'US' },
    ],
    [
      DataStorageType.AWS_ATHENA,
      { region: 'us-east-1', outputBucket: 's3://r' },
      { outputBucket: 's3://r', region: 'us-east-1', extra: 'x' },
      { region: 'us-east-1', outputBucket: 's3://other' },
    ],
    [
      DataStorageType.AWS_REDSHIFT,
      { connectionType: 'SERVERLESS', region: 'us-east-1', database: 'd', workgroupName: 'w' },
      {
        workgroupName: 'w',
        database: 'd',
        region: 'us-east-1',
        connectionType: 'SERVERLESS',
        clusterIdentifier: 'c',
      },
      { connectionType: 'SERVERLESS', region: 'us-east-1', database: 'e', workgroupName: 'w' },
    ],
    [
      DataStorageType.SNOWFLAKE,
      { account: 'a', warehouse: 'w' },
      { warehouse: 'w', account: 'a', extra: true },
      { account: 'a', warehouse: 'w', role: 'r' },
    ],
    [
      DataStorageType.DATABRICKS,
      { host: 'h.cloud.databricks.com', httpPath: '/p' },
      { httpPath: '/p', host: 'h.cloud.databricks.com', extra: null },
      { host: 'h.cloud.databricks.com', httpPath: '/q' },
    ],
  ])(
    '%s: treats a re-sent config as the same and a real change as a change',
    (type, stored, resent, changed) => {
      expect(sameStorageConfig(type, stored as never, resent as never)).toBe(true);
      expect(sameStorageConfig(type, stored as never, changed as never)).toBe(false);
    }
  );

  it('compares the raw configs when one does not parse', () => {
    expect(
      sameStorageConfig(DataStorageType.SNOWFLAKE, null, { account: 'a', warehouse: 'w' } as never)
    ).toBe(false);
    expect(
      sameStorageConfig(
        DataStorageType.SNOWFLAKE,
        { account: '' } as never,
        { account: '' } as never
      )
    ).toBe(true);
  });
});

describe('storage credential definitions', () => {
  it('maps every DataStorageType to defined built-in definitions', () => {
    const ids = new Set(BUILTIN_CREDENTIAL_DEFINITIONS.map(d => d.id));
    for (const type of Object.values(DataStorageType)) {
      const mapped = STORAGE_CREDENTIAL_DEFINITION_IDS[type];
      expect(mapped.length).toBeGreaterThan(0);
      for (const id of mapped) expect(ids.has(id)).toBe(true);
    }
  });

  it('pins the field keys and secret flags of every Storage definition', () => {
    const storageIds = new Set(Object.values(STORAGE_CREDENTIAL_DEFINITION_IDS).flat());
    const shapes = Object.fromEntries(
      BUILTIN_CREDENTIAL_DEFINITIONS.filter(d => storageIds.has(d.id)).map(d => [
        d.id,
        d.auth.type === 'fields' ? d.auth.fields.map(f => [f.key, f.secret]) : d.auth.type,
      ])
    );

    expect(shapes).toEqual({
      'google-service-account': 'google-service-account',
      'google-oauth': 'oauth',
      'aws-access-key': [
        ['accessKeyId', false],
        ['secretAccessKey', true],
        ['sessionToken', true],
      ],
      'snowflake-password': [
        ['username', false],
        ['password', true],
      ],
      'snowflake-key-pair': [
        ['username', false],
        ['privateKey', true],
        ['privateKeyPassphrase', true],
      ],
      'databricks-token': [['token', true]],
    });
  });

  it('reads a field from either half, whatever its secret flag says now', () => {
    expect(
      toAdapterCredentials(
        'aws-access-key',
        { fields: { accessKeyId: 'a', secretAccessKey: 's' } },
        { fields: { sessionToken: 't' } }
      )
    ).toEqual({ accessKeyId: 'a', secretAccessKey: 's', sessionToken: 't' });
  });

  it('builds adapter credentials', () => {
    expect(
      toAdapterCredentials(
        'snowflake-key-pair',
        { fields: { privateKey: 'pk' } },
        { fields: { username: 'u' } }
      )
    ).toEqual({ authMethod: 'KEY_PAIR', username: 'u', privateKey: 'pk' });
    expect(
      toAdapterCredentials(
        'snowflake-key-pair',
        { fields: { privateKey: 'pk', privateKeyPassphrase: 'pp' } },
        { fields: { username: 'u' } }
      )
    ).toEqual({
      authMethod: 'KEY_PAIR',
      username: 'u',
      privateKey: 'pk',
      privateKeyPassphrase: 'pp',
    });
    expect(toAdapterCredentials('databricks-token', { fields: { token: 't' } }, null)).toEqual({
      authMethod: 'PERSONAL_ACCESS_TOKEN',
      token: 't',
    });
    expect(
      toAdapterCredentials(
        'aws-access-key',
        { fields: { secretAccessKey: 's' } },
        { fields: { accessKeyId: 'a' } }
      )
    ).toStrictEqual({ accessKeyId: 'a', secretAccessKey: 's' });
    expect(
      toAdapterCredentials(
        'google-service-account',
        { value: JSON.stringify(serviceAccount) },
        null
      )
    ).toEqual(serviceAccount);
  });

  it('rejects google-oauth', () => {
    expect(() => toAdapterCredentials('google-oauth', { value: 'x' }, null)).toThrow();
  });
});
