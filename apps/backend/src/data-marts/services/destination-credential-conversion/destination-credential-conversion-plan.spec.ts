import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import {
  planDestinationCredentialConversion,
  type DestinationConversionOptions,
  type UnconvertedDestination,
} from './destination-credential-conversion-plan';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const OPTIONS: DestinationConversionOptions = {
  googleSignIn: {
    clientId: 'destination-client',
    sheetsScopes: [SHEETS_SCOPE, DRIVE_SCOPE, 'openid', 'email'],
  },
};
const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=k&token=t';
const KEY = serviceAccountKey();
const SHEETS_REQUIREMENT = {
  definitionIds: ['google-service-account', 'google-sheets-oauth'],
  scopes: [SHEETS_SCOPE],
};

type Key = UnconvertedDestination['key'];

function serviceAccount(key: unknown = JSON.parse(KEY)): Key {
  return {
    type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
    // SQLite returns a JSON column as text, MySQL as a parsed value.
    credentials: JSON.stringify({ type: 'google-sheets-credentials', serviceAccountKey: key }),
    identity: null,
  };
}

function webhook(webhookUrl: string = WEBHOOK_URL): Key {
  return {
    type: DestinationCredentialType.GOOGLE_CHAT_WEBHOOK,
    credentials: { type: 'google-chat-credentials', webhookUrl },
    identity: null,
  };
}

function googleOAuth(tokens: { access?: string; expiry?: number } = {}): Key {
  return {
    type: DestinationCredentialType.GOOGLE_OAUTH,
    credentials: {
      access_token: tokens.access ?? 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      scope: `${SHEETS_SCOPE} openid`,
      expiry_date: tokens.expiry ?? 1000,
      id_token: 'id-token-1',
    },
    identity: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
  };
}

let next = 0;

function destination(
  key: Key,
  overrides: Partial<UnconvertedDestination> = {}
): UnconvertedDestination {
  next += 1;
  return {
    id: `destination-${next}`,
    projectId: 'project-1',
    title: 'Sales sheet',
    type: DataDestinationType.GOOGLE_SHEETS,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ownerIds: ['editor-1'],
    contextIds: [],
    key,
    ...overrides,
  };
}

function chat(key: Key, overrides: Partial<UnconvertedDestination> = {}) {
  return destination(key, { type: DataDestinationType.GOOGLE_CHAT, title: 'Alerts', ...overrides });
}

function destinationIds(plan: ReturnType<typeof planDestinationCredentialConversion>) {
  return plan.credentials.map(credential =>
    credential.bindings.map(binding => binding.destinationId)
  );
}

describe('planDestinationCredentialConversion', () => {
  it('gives one service account key of the same owners one Credential with the Contexts they share', () => {
    const a = destination(serviceAccount(), { contextIds: ['c1', 'c2'] });
    // The key as JSON text, as an older write may have kept it.
    const b = destination(serviceAccount(KEY), { contextIds: ['c2', 'c3'] });

    const plan = planDestinationCredentialConversion([a, b], OPTIONS);

    expect(destinationIds(plan)).toEqual([[a.id, b.id]]);
    expect(plan.credentials[0]).toEqual({
      projectId: 'project-1',
      definitionId: 'google-service-account',
      title: 'docs-writer@acme-docs.iam.gserviceaccount.com',
      secret: { value: JSON.stringify(JSON.parse(KEY)) },
      publicMetadata: {
        clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
        projectId: 'acme-docs',
        privateKeyId: 'key-1',
        clientId: '1234567890',
      },
      ownerIds: ['editor-1'],
      contextIds: ['c2'],
      bindings: [a, b].map(({ id }) => ({ destinationId: id, requirement: SHEETS_REQUIREMENT })),
    });
    expect(plan.skipped).toEqual([]);
  });

  it('keeps one key apart across owner sets and projects, and merges owners in any order', () => {
    const a = destination(serviceAccount(), { ownerIds: ['u2', 'u1'] });
    const sameOwners = destination(serviceAccount(), { ownerIds: ['u1', 'u2'] });
    const otherOwners = destination(serviceAccount(), { ownerIds: ['u1'] });
    const otherProject = destination(serviceAccount(), {
      projectId: 'project-2',
      ownerIds: ['u1', 'u2'],
    });

    const plan = planDestinationCredentialConversion(
      [a, sameOwners, otherOwners, otherProject],
      OPTIONS
    );

    expect(destinationIds(plan)).toEqual([
      [a.id, sameOwners.id],
      [otherOwners.id],
      [otherProject.id],
    ]);
    expect(plan.credentials.map(credential => credential.ownerIds)).toEqual([
      ['u1', 'u2'],
      ['u1'],
      ['u1', 'u2'],
    ]);
  });

  it('converts a Google Chat webhook row, titled by the earliest Destination', () => {
    const later = chat(webhook(), { title: 'Later', createdAt: new Date('2026-02-01') });
    const earlier = chat(webhook(` ${WEBHOOK_URL} `), {
      title: 'Earlier',
      createdAt: new Date('2026-01-15'),
    });

    const plan = planDestinationCredentialConversion([later, earlier], OPTIONS);

    expect(destinationIds(plan)).toEqual([[later.id, earlier.id]]);
    expect(plan.credentials[0]).toMatchObject({
      definitionId: 'google-chat-webhook',
      title: 'Earlier',
      secret: { fields: { webhookUrl: WEBHOOK_URL } },
      publicMetadata: { fields: {} },
      bindings: [
        { requirement: { definitionIds: ['google-chat-webhook'], scopes: [] } },
        { requirement: { definitionIds: ['google-chat-webhook'], scopes: [] } },
      ],
    });
  });

  it('converts a Google OAuth row to a Sheets Google account, keeping the newest access token', () => {
    const older = destination(googleOAuth({ access: 'access-old', expiry: 1000 }));
    const newer = destination(googleOAuth({ access: 'access-new', expiry: 2000 }));

    const plan = planDestinationCredentialConversion([older, newer], OPTIONS);

    expect(destinationIds(plan)).toEqual([[older.id, newer.id]]);
    const [credential] = plan.credentials;
    expect(credential).toMatchObject({
      definitionId: 'google-sheets-oauth',
      title: 'ann@example.com',
      secret: {
        oauth: {
          provider: 'google',
          clientId: 'destination-client',
          tokens: {
            access_token: 'access-new',
            refresh_token: 'refresh-1',
            token_type: 'Bearer',
            scope: `${SHEETS_SCOPE} openid`,
            expiry_date: 2000,
          },
        },
      },
      publicMetadata: {
        account: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
        scopes: [SHEETS_SCOPE, 'openid'],
      },
    });
    expect(credential.bindings[0].requirement).toEqual(SHEETS_REQUIREMENT);
    expect(JSON.stringify(credential)).not.toContain('id-token-1');
  });

  it('lists the converted Destinations whose Google grant lacks a required scope', () => {
    const oauth = destination(googleOAuth());
    const key = destination(serviceAccount());
    const wider = {
      googleSignIn: {
        clientId: 'destination-client',
        sheetsScopes: [SHEETS_SCOPE, DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive'],
      },
    };

    expect(planDestinationCredentialConversion([oauth, key], wider).lackingScopes).toEqual([
      oauth.id,
    ]);
    // The grant has no drive.file, which writing does not need.
    expect(planDestinationCredentialConversion([oauth], OPTIONS).lackingScopes).toEqual([]);
  });

  it('skips Google OAuth rows while Google sign-in for Destinations is not configured', () => {
    const oauth = destination(googleOAuth());
    const key = destination(serviceAccount());

    const plan = planDestinationCredentialConversion([oauth, key], { googleSignIn: null });

    expect(destinationIds(plan)).toEqual([[key.id]]);
    expect(plan.credentials[0].bindings[0].requirement.scopes).toBeNull();
    expect(plan.skipped).toEqual([
      { destinationId: oauth.id, reason: 'Google sign-in is not configured' },
    ]);
  });

  it('skips a row it cannot convert with a reason that names no key value', () => {
    const invalidWebhook = chat(
      webhook('https://example.com/v1/spaces/s/messages?key=leaked-secret&token=t')
    );
    const noKey = destination({
      type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
      credentials: { type: 'google-sheets-credentials' },
      identity: null,
    });
    const brokenKey = destination(serviceAccount({ private_key: 'leaked-secret' }));
    const nullCredentials = destination({
      type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
      credentials: null,
      identity: null,
    });
    const email = chat({
      type: DestinationCredentialType.EMAIL,
      credentials: { type: 'email-credentials', to: ['a@example.com'] },
      identity: null,
    });
    const misplaced = chat(serviceAccount());
    const slack = destination(webhook(), { type: DataDestinationType.SLACK });
    const converted = chat(webhook());

    const plan = planDestinationCredentialConversion(
      [invalidWebhook, noKey, brokenKey, nullCredentials, email, misplaced, slack, converted],
      OPTIONS
    );

    expect(destinationIds(plan)).toEqual([[converted.id]]);
    expect(plan.skipped).toEqual([
      { destinationId: invalidWebhook.id, reason: 'not a Google Chat webhook URL' },
      { destinationId: noKey.id, reason: 'no service account key' },
      { destinationId: brokenKey.id, reason: 'unparseable credentials' },
      { destinationId: nullCredentials.id, reason: 'unparseable credentials' },
      { destinationId: email.id, reason: 'unknown key type' },
      { destinationId: misplaced.id, reason: 'key type does not fit the Destination type' },
      { destinationId: slack.id, reason: 'unknown Destination type' },
    ]);
    expect(JSON.stringify(plan.skipped)).not.toMatch(/secret/);
  });

  it('cuts a title longer than credential.title to 255 characters', () => {
    const plan = planDestinationCredentialConversion(
      [chat(webhook(), { title: 'A'.repeat(300) })],
      OPTIONS
    );

    expect(plan.credentials[0].title).toBe('A'.repeat(255));
  });
});
