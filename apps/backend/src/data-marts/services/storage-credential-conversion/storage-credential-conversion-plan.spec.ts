import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import {
  planStorageCredentialConversion,
  type ConversionOptions,
  type UnconvertedStorage,
} from './storage-credential-conversion-plan';

const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery';
const OPTIONS: ConversionOptions = {
  googleStorageClientId: 'storage-client',
  bigQueryScopes: [BIGQUERY_SCOPE],
};

type Key = UnconvertedStorage['key'];

function aws(secretAccessKey: string, accessKeyId = 'AKIA1'): Key {
  return {
    type: StorageCredentialType.AWS_IAM,
    // SQLite returns a JSON column as text, MySQL as a parsed value.
    credentials: JSON.stringify({ accessKeyId, secretAccessKey }),
    identity: JSON.stringify({ accessKeyId }),
  };
}

function databricks(token: string): Key {
  return {
    type: StorageCredentialType.DATABRICKS_PAT,
    credentials: { authMethod: 'PAT', token },
    identity: null,
  };
}

function googleOAuth(
  tokens: { refresh?: string; access?: string; expiry?: number } = {},
  identity: unknown = { email: 'ann@example.com', name: 'Ann', picture: 'p.png' }
): Key {
  return {
    type: StorageCredentialType.GOOGLE_OAUTH,
    credentials: {
      access_token: tokens.access ?? 'access-1',
      refresh_token: tokens.refresh ?? 'refresh-1',
      token_type: 'Bearer',
      scope: `${BIGQUERY_SCOPE} openid`,
      expiry_date: tokens.expiry ?? 1000,
      id_token: 'id-token-1',
    },
    identity,
  };
}

let next = 0;

function storage(key: Key, overrides: Partial<UnconvertedStorage> = {}): UnconvertedStorage {
  next += 1;
  return {
    id: `storage-${next}`,
    projectId: 'project-1',
    title: 'Athena',
    type: DataStorageType.AWS_ATHENA,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ownerIds: ['editor-1'],
    contextIds: [],
    key,
    ...overrides,
  };
}

function storageIds(plan: ReturnType<typeof planStorageCredentialConversion>): string[][] {
  return plan.credentials.map(credential => credential.bindings.map(binding => binding.storageId));
}

describe('planStorageCredentialConversion', () => {
  it('gives identical keys of the same owners one Credential with the Contexts they share', () => {
    const a = storage(aws('secret'), { contextIds: ['c1', 'c2'] });
    const b = storage(aws('secret'), { contextIds: ['c2', 'c3'] });

    const plan = planStorageCredentialConversion([a, b], OPTIONS);

    expect(storageIds(plan)).toEqual([[a.id, b.id]]);
    expect(plan.credentials[0]).toMatchObject({
      projectId: 'project-1',
      definitionId: 'aws-access-key',
      title: 'AKIA1',
      secret: { fields: { secretAccessKey: 'secret' } },
      publicMetadata: { fields: { accessKeyId: 'AKIA1' } },
      contextIds: ['c2'],
    });
    expect(plan.skipped).toEqual([]);
  });

  it('keeps identical keys apart across owner sets, projects and surrounding whitespace', () => {
    const a = storage(aws('secret'), { ownerIds: ['editor-1'] });
    const otherOwners = storage(aws('secret'), { ownerIds: ['editor-1', 'editor-2'] });
    const otherProject = storage(aws('secret'), { projectId: 'project-2' });
    const padded = storage(aws(' secret '));

    const plan = planStorageCredentialConversion([a, otherOwners, otherProject, padded], OPTIONS);

    expect(storageIds(plan)).toEqual([[a.id], [otherOwners.id], [otherProject.id], [padded.id]]);
    expect(plan.credentials[2].projectId).toBe('project-2');
  });

  it('makes every Storage owner, a Business User included, a Credential owner', () => {
    const plan = planStorageCredentialConversion(
      [storage(aws('secret'), { ownerIds: ['viewer-1', 'admin-1', 'former-member'] })],
      OPTIONS
    );

    expect(plan.credentials[0].ownerIds).toEqual(['admin-1', 'former-member', 'viewer-1']);
  });

  it('merges owner lists in any order, and keeps a Storage without owners', () => {
    const a = storage(aws('secret'), { ownerIds: ['u2', 'u1'] });
    const b = storage(aws('secret'), { ownerIds: ['u1', 'u2'] });
    const ownerless = storage(aws('other'), { ownerIds: [] });

    const plan = planStorageCredentialConversion([a, b, ownerless], OPTIONS);

    expect(storageIds(plan)).toEqual([[a.id, b.id], [ownerless.id]]);
    expect(plan.credentials.map(credential => credential.ownerIds)).toEqual([['u1', 'u2'], []]);
  });

  it('cuts a title longer than credential.title to 255 characters', () => {
    const plan = planStorageCredentialConversion(
      [storage(aws('long', 'A'.repeat(300)), { title: 'Warehouse' })],
      OPTIONS
    );

    expect(plan.credentials[0].title).toBe('A'.repeat(255));
  });

  it('titles a Credential by its identity, else the earliest Storage title, else its provider', () => {
    const key = serviceAccountKey();
    const plan = planStorageCredentialConversion(
      [
        storage(
          { type: StorageCredentialType.GOOGLE_SERVICE_ACCOUNT, credentials: key, identity: null },
          { type: DataStorageType.GOOGLE_BIGQUERY, title: 'Warehouse' }
        ),
        storage(databricks('token'), {
          type: DataStorageType.DATABRICKS,
          title: 'Later',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
        storage(databricks('token'), {
          type: DataStorageType.DATABRICKS,
          title: 'Earlier',
          createdAt: new Date('2026-01-15T00:00:00.000Z'),
        }),
        storage(databricks('untitled'), { type: DataStorageType.DATABRICKS, title: null }),
      ],
      OPTIONS
    );

    expect(plan.credentials.map(credential => credential.title)).toEqual([
      JSON.parse(key).client_email,
      'Earlier',
      'Databricks token',
    ]);
    expect(plan.credentials[0]).toMatchObject({
      definitionId: 'google-service-account',
      secret: { value: key },
      bindings: [
        {
          requirement: {
            definitionIds: ['google-service-account', 'google-oauth'],
            scopes: [BIGQUERY_SCOPE],
          },
        },
      ],
    });
  });

  it('converts a Google OAuth row, keeping the newest access token of a merged grant', () => {
    const older = storage(googleOAuth({ access: 'access-old', expiry: 1000 }), {
      type: DataStorageType.GOOGLE_BIGQUERY,
    });
    const newer = storage(googleOAuth({ access: 'access-new', expiry: 2000 }), {
      type: DataStorageType.GOOGLE_BIGQUERY,
    });

    const plan = planStorageCredentialConversion([older, newer], OPTIONS);

    expect(storageIds(plan)).toEqual([[older.id, newer.id]]);
    const [credential] = plan.credentials;
    expect(credential).toEqual({
      projectId: 'project-1',
      definitionId: 'google-oauth',
      title: 'ann@example.com',
      secret: {
        oauth: {
          provider: 'google',
          clientId: 'storage-client',
          tokens: {
            access_token: 'access-new',
            refresh_token: 'refresh-1',
            token_type: 'Bearer',
            scope: `${BIGQUERY_SCOPE} openid`,
            expiry_date: 2000,
          },
        },
      },
      publicMetadata: {
        account: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
        scopes: [BIGQUERY_SCOPE, 'openid'],
      },
      ownerIds: ['editor-1'],
      contextIds: [],
      bindings: [older, newer].map(({ id }) => ({
        storageId: id,
        requirement: {
          definitionIds: ['google-service-account', 'google-oauth'],
          scopes: [BIGQUERY_SCOPE],
        },
      })),
    });
    expect(JSON.stringify(credential)).not.toContain('id-token-1');
  });

  it('names no account for an OAuth row whose account lookup failed', () => {
    const plan = planStorageCredentialConversion(
      [
        storage(googleOAuth({}, JSON.stringify({ name: 'Ann' })), {
          type: DataStorageType.GOOGLE_BIGQUERY,
          title: 'Ann BigQuery',
        }),
      ],
      OPTIONS
    );

    expect(plan.credentials[0]).toMatchObject({
      title: 'Ann BigQuery',
      publicMetadata: { account: { email: '', name: null, picture: null } },
    });
  });

  it('skips a row it cannot convert with a reason that names no key value', () => {
    const unknownType = storage({ type: 'kerberos', credentials: '{}', identity: null });
    const unparseable = storage({
      type: StorageCredentialType.AWS_IAM,
      credentials: '{"secretAccessKey": "leaked-secret"',
      identity: null,
    });
    const nullCredentials = storage({
      type: StorageCredentialType.AWS_IAM,
      credentials: null,
      identity: null,
    });
    const unknownStorageType = storage(aws('other-secret'), {
      type: 'MAINFRAME' as DataStorageType,
    });
    const converted = storage(aws('secret'));

    const plan = planStorageCredentialConversion(
      [unknownType, unparseable, nullCredentials, unknownStorageType, converted],
      OPTIONS
    );

    expect(storageIds(plan)).toEqual([[converted.id]]);
    expect(plan.skipped).toEqual([
      { storageId: unknownType.id, reason: 'unknown key type' },
      { storageId: unparseable.id, reason: 'unparseable credentials' },
      { storageId: nullCredentials.id, reason: 'unparseable credentials' },
      { storageId: unknownStorageType.id, reason: 'unknown Storage type' },
    ]);
    expect(JSON.stringify(plan.skipped)).not.toMatch(/secret/);
  });

  it('skips Google OAuth rows while the Storage OAuth client is not configured', () => {
    const oauth = storage(googleOAuth(), { type: DataStorageType.GOOGLE_BIGQUERY });
    const other = storage(aws('secret'));

    const plan = planStorageCredentialConversion([oauth, other], {
      googleStorageClientId: undefined,
      bigQueryScopes: [BIGQUERY_SCOPE],
    });

    expect(storageIds(plan)).toEqual([[other.id]]);
    expect(plan.skipped).toEqual([
      { storageId: oauth.id, reason: 'Google sign-in is not configured' },
    ]);
  });

  it('lists the converted Storages whose Google grant lacks a configured scope', () => {
    const oauth = storage(googleOAuth(), { type: DataStorageType.GOOGLE_BIGQUERY });
    const serviceAccount = storage(
      {
        type: StorageCredentialType.GOOGLE_SERVICE_ACCOUNT,
        credentials: serviceAccountKey(),
        identity: null,
      },
      { type: DataStorageType.GOOGLE_BIGQUERY }
    );
    const wider = {
      ...OPTIONS,
      bigQueryScopes: [BIGQUERY_SCOPE, 'https://www.googleapis.com/auth/drive'],
    };

    expect(planStorageCredentialConversion([oauth, serviceAccount], wider).lackingScopes).toEqual([
      oauth.id,
    ]);
    expect(planStorageCredentialConversion([oauth], OPTIONS).lackingScopes).toEqual([]);
  });

  it('snapshots no BigQuery scopes for a binding while Google sign-in is not configured', () => {
    const plan = planStorageCredentialConversion(
      [
        storage(
          {
            type: StorageCredentialType.GOOGLE_SERVICE_ACCOUNT,
            credentials: serviceAccountKey(),
            identity: null,
          },
          { type: DataStorageType.GOOGLE_BIGQUERY }
        ),
      ],
      { googleStorageClientId: 'storage-client', bigQueryScopes: null }
    );

    expect(plan.credentials[0].bindings[0].requirement.scopes).toBeNull();
  });
});
