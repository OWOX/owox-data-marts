import { BadRequestException } from '@nestjs/common';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';
import {
  applyCustomConnectorUpdate,
  applyFieldsUpdate,
  builtinFieldRule,
  parseFieldsForCreate,
  secretFieldKeysWithValue,
} from './credential-fields';

function fieldsAuth(id: string) {
  const auth = BUILTIN_CREDENTIAL_DEFINITIONS.find(definition => definition.id === id)?.auth;
  if (auth?.type !== 'fields') throw new Error(`${id} is not a fields definition`);
  return auth;
}

const aws = fieldsAuth('aws-access-key');

describe('parseFieldsForCreate', () => {
  it('stores secret keys in the secret and the others as public metadata', () => {
    expect(
      parseFieldsForCreate(
        aws,
        {
          accessKeyId: 'key-id-1',
          secretAccessKey: 'secret-access-key-1',
          sessionToken: 'session-token-1',
        },
        'aws-access-key'
      )
    ).toEqual({
      secret: {
        fields: { secretAccessKey: 'secret-access-key-1', sessionToken: 'session-token-1' },
      },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
    });
  });

  it('rejects a missing required field', () => {
    expect(() => parseFieldsForCreate(aws, { accessKeyId: 'key-id-1' }, 'aws-access-key')).toThrow(
      new BadRequestException('Secret access key is required')
    );
  });

  it('rejects an empty string', () => {
    expect(() =>
      parseFieldsForCreate(
        aws,
        { accessKeyId: '', secretAccessKey: 'secret-access-key-1' },
        'aws-access-key'
      )
    ).toThrow(new BadRequestException('Access key ID cannot be empty'));
  });

  it('rejects a whitespace-only value', () => {
    expect(() =>
      parseFieldsForCreate(
        aws,
        { accessKeyId: 'key-id-1', secretAccessKey: ' \n\t' },
        'aws-access-key'
      )
    ).toThrow(new BadRequestException('Secret access key cannot be empty'));
  });

  it('rejects a value that is not a string', () => {
    expect(() =>
      parseFieldsForCreate(
        aws,
        { accessKeyId: 42, secretAccessKey: 'secret-access-key-1' },
        'aws-access-key'
      )
    ).toThrow(new BadRequestException('Access key ID must be a string'));
  });

  it('rejects a value longer than 32768 characters', () => {
    expect(() =>
      parseFieldsForCreate(
        aws,
        { accessKeyId: 'key-id-1', secretAccessKey: 'x'.repeat(32_769) },
        'aws-access-key'
      )
    ).toThrow(new BadRequestException('Secret access key must be at most 32768 characters'));
  });

  it('keeps a trailing newline in a private key', () => {
    const privateKey = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';

    const parsed = parseFieldsForCreate(
      fieldsAuth('snowflake-key-pair'),
      {
        username: ' loader ',
        privateKey,
      },
      'snowflake-key-pair'
    );

    expect(parsed.secret.fields.privateKey).toBe(privateKey);
    expect(parsed.publicMetadata.fields.username).toBe(' loader ');
  });

  it('rejects an undeclared key', () => {
    expect(() =>
      parseFieldsForCreate(
        aws,
        {
          accessKeyId: 'key-id-1',
          secretAccessKey: 'secret-access-key-1',
          region: 'us-east-1',
        },
        'aws-access-key'
      )
    ).toThrow(new BadRequestException('Unknown field region'));
  });
});

const fixtureField = (key: string, secret: boolean, identity = false, required = true) => ({
  key,
  label: key,
  input: secret ? 'password' : 'text',
  secret,
  required,
  identity,
});
const spare = {
  type: 'fields',
  fields: [fixtureField('Region', false), fixtureField('Token', true), fixtureField('Other', true)],
} as Parameters<typeof applyFieldsUpdate>[0];
const spareCurrent = {
  secret: { fields: { Token: 'token-1', Other: 'other-1' } },
  publicMetadata: { fields: { Region: 'eu' } },
};

describe('applyFieldsUpdate', () => {
  const current = {
    secret: { fields: { secretAccessKey: 'secret-access-key-1', sessionToken: 'session-token-1' } },
    publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
  };

  it('keeps an omitted field', () => {
    expect(applyFieldsUpdate(spare, spareCurrent, { Region: 'us' }, 'spare')).toEqual({
      secret: spareCurrent.secret,
      publicMetadata: { fields: { Region: 'us' } },
      secretChanged: false,
    });
  });

  it('clears an optional field on null', () => {
    expect(applyFieldsUpdate(aws, current, { sessionToken: null }, 'aws-access-key')).toEqual({
      secret: { fields: { secretAccessKey: 'secret-access-key-1' } },
      publicMetadata: current.publicMetadata,
      secretChanged: true,
    });
  });

  it('rejects null on a required field', () => {
    expect(() =>
      applyFieldsUpdate(aws, current, { secretAccessKey: null }, 'aws-access-key')
    ).toThrow(new BadRequestException('Secret access key is required'));
  });

  it('rejects an empty string on update', () => {
    expect(() => applyFieldsUpdate(aws, current, { sessionToken: '' }, 'aws-access-key')).toThrow(
      new BadRequestException('Session token cannot be empty')
    );
  });

  it('rejects an undeclared key on update', () => {
    expect(() =>
      applyFieldsUpdate(aws, current, { region: 'us-east-1' }, 'aws-access-key')
    ).toThrow(new BadRequestException('Unknown field region'));
  });

  it('reports a secret change when a secret key is present', () => {
    expect(applyFieldsUpdate(aws, current, {}, 'aws-access-key').secretChanged).toBe(false);
    expect(
      applyFieldsUpdate(aws, current, { secretAccessKey: 'secret-access-key-2' }, 'aws-access-key')
        .secretChanged
    ).toBe(true);
  });

  it('counts a new identity sent with its secrets as a secret change, but not the same identity', () => {
    const resent = { secretAccessKey: 'secret-access-key-2', sessionToken: 'session-token-2' };
    expect(
      applyFieldsUpdate(aws, current, { accessKeyId: 'key-id-2', ...resent }, 'aws-access-key')
        .secretChanged
    ).toBe(true);
    expect(
      applyFieldsUpdate(aws, current, { accessKeyId: 'key-id-1' }, 'aws-access-key').secretChanged
    ).toBe(false);
  });

  it('rejects an identity change that leaves a stored secret, naming labels only', () => {
    expect(() =>
      applyFieldsUpdate(aws, current, { accessKeyId: 'key-id-2' }, 'aws-access-key')
    ).toThrow(
      new BadRequestException(
        'Enter Secret access key, Session token again to change Access key ID'
      )
    );
    expect(() =>
      applyFieldsUpdate(
        aws,
        current,
        { accessKeyId: 'key-id-2', secretAccessKey: 'secret-access-key-2' },
        'aws-access-key'
      )
    ).toThrow(new BadRequestException('Enter Session token again to change Access key ID'));
  });
});

describe('an identity change on update', () => {
  const noToken = {
    secret: { fields: { secretAccessKey: 'secret-access-key-1' } },
    publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
  };

  it('needs no session token that was never stored', () => {
    const result = applyFieldsUpdate(
      aws,
      noToken,
      { accessKeyId: 'key-id-2', secretAccessKey: 'secret-access-key-2' },
      'aws-access-key'
    );

    expect(result.secret).toEqual({ fields: { secretAccessKey: 'secret-access-key-2' } });
  });

  it('reports a secret change for a new identity when no secret is stored', () => {
    const optional = {
      type: 'fields',
      fields: [fixtureField('Host', false, true), fixtureField('Token', true, false, false)],
    } as Parameters<typeof applyFieldsUpdate>[0];
    const bare = { secret: { fields: {} }, publicMetadata: { fields: { Host: 'a' } } };

    expect(applyFieldsUpdate(optional, bare, { Host: 'b' }, 'bare').secretChanged).toBe(true);
    expect(applyFieldsUpdate(optional, bare, { Host: 'a' }, 'bare').secretChanged).toBe(false);
  });

  it('names only the identity that changed and the secrets left out', () => {
    const two = {
      type: 'fields',
      fields: [
        fixtureField('Shop', false, true),
        fixtureField('Zone', false),
        fixtureField('Token', true),
        fixtureField('Other', true),
      ],
    } as Parameters<typeof applyFieldsUpdate>[0];
    const stored = {
      secret: { fields: { Token: 'token-1', Other: 'other-1' } },
      publicMetadata: { fields: { Shop: 'a', Zone: 'z' } },
    };

    expect(() =>
      applyFieldsUpdate(two, stored, { Shop: 'b', Zone: 'y', Token: 'token-2' }, 'two')
    ).toThrow(new BadRequestException('Enter Other again to change Shop'));
  });

  it('does not treat a null identity as a change when none is stored', () => {
    const optional = {
      type: 'fields',
      fields: [fixtureField('Host', false, true, false), fixtureField('Token', true)],
    } as Parameters<typeof applyFieldsUpdate>[0];
    const stored = { secret: { fields: { Token: 'token-1' } }, publicMetadata: { fields: {} } };

    expect(() => applyFieldsUpdate(optional, stored, { Host: null }, 'opt')).not.toThrow();
  });
});

describe('a rotated refresh token on update', () => {
  const ROTATED = 'generated_refresh_token';
  const auth = {
    type: 'fields',
    fields: [fixtureField('ClientId', false), fixtureField('RefreshToken', true)],
  } as Parameters<typeof applyFieldsUpdate>[0];
  const generated = {
    secret: { fields: { RefreshToken: 'refresh-1', [ROTATED]: 'rotated-1' } },
    publicMetadata: { fields: { ClientId: 'client-1' } },
  };
  const custom = {
    secret: generated.secret,
    publicMetadata: {
      hosts: ['api.acme.example'],
      fieldList: [
        { key: 'ClientId', label: 'Client ID', secret: false },
        { key: 'RefreshToken', label: 'Refresh token', secret: true },
      ],
      fields: { ClientId: 'client-1' },
    },
  };
  const update = (input: Record<string, unknown>) => ({
    generated: applyFieldsUpdate(auth, generated, input, 'source:Acme:oauth2').secret,
    custom: applyCustomConnectorUpdate(custom, input).secret,
  });

  it('updating another field keeps the rotated refresh token', () => {
    const kept = { fields: { RefreshToken: 'refresh-1', [ROTATED]: 'rotated-1' } };

    expect(update({ ClientId: 'client-2' })).toEqual({ generated: kept, custom: kept });
    expect(update({ RefreshToken: 'refresh-1' })).toEqual({ generated: kept, custom: kept });
  });

  it('a custom connector drops the rotated token when any secret field changes', () => {
    const named = {
      secret: { fields: { Token: 'token-1', [ROTATED]: 'rotated-1' } },
      publicMetadata: {
        hosts: ['api.acme.example'],
        fieldList: [
          { key: 'Region', label: 'Region', secret: false },
          { key: 'Token', label: 'Token', secret: true },
        ],
        fields: { Region: 'eu' },
      },
    };

    expect(applyCustomConnectorUpdate(named, { Token: 'token-2' }).secret).toEqual({
      fields: { Token: 'token-2' },
    });
    expect(applyCustomConnectorUpdate(named, { Region: 'us' }).secret).toEqual(named.secret);
    expect(applyCustomConnectorUpdate(named, { Token: 'token-1' }).secret).toEqual(named.secret);
  });

  it('a bundled definition keeps the rotated token when another secret changes', () => {
    const withOther = {
      type: 'fields',
      fields: [fixtureField('RefreshToken', true), fixtureField('Other', true)],
    } as Parameters<typeof applyFieldsUpdate>[0];
    const stored = {
      secret: { fields: { RefreshToken: 'refresh-1', Other: 'other-1', [ROTATED]: 'rotated-1' } },
      publicMetadata: { fields: {} },
    };

    expect(applyFieldsUpdate(withOther, stored, { Other: 'other-2' }, 'x').secret).toEqual({
      fields: { RefreshToken: 'refresh-1', Other: 'other-2', [ROTATED]: 'rotated-1' },
    });
  });

  it("an edit keeps the old row's token a conversion recorded, with the token it came from", () => {
    const OLD = 'legacy_generated_refresh_token';
    const secret = { fields: { ...generated.secret.fields, [OLD]: 'rotated-1' } };
    const converted = { secret };
    const kept = {
      fields: { RefreshToken: 'refresh-1', [ROTATED]: 'rotated-1', [OLD]: 'rotated-1' },
    };

    for (const input of [
      { ClientId: 'client-2' },
      { ClientId: 'client-1' },
      { RefreshToken: 'refresh-1' },
    ]) {
      expect(applyFieldsUpdate(auth, { ...generated, ...converted }, input, 'x').secret).toEqual(
        kept
      );
      expect(applyCustomConnectorUpdate({ ...custom, ...converted }, input).secret).toEqual(kept);
    }
    expect(secretFieldKeysWithValue(auth, { ...generated, ...converted })).toEqual([
      'RefreshToken',
    ]);
  });

  it('sending the stored ClientSecret again keeps the rotated token and its base', () => {
    const OLD = 'legacy_generated_refresh_token';
    const withSecret = {
      type: 'fields',
      fields: [
        fixtureField('ClientId', false, true),
        fixtureField('ClientSecret', true),
        fixtureField('RefreshToken', true),
      ],
    } as Parameters<typeof applyFieldsUpdate>[0];
    const fields = {
      ClientSecret: 'cs-1',
      RefreshToken: 'refresh-1',
      [ROTATED]: 'r-1',
      [OLD]: 'r-1',
    };
    const stored = { secret: { fields }, publicMetadata: { fields: { ClientId: 'client-1' } } };

    expect(applyFieldsUpdate(withSecret, stored, { ClientSecret: 'cs-1' }, 'x').secret).toEqual({
      fields,
    });
  });

  it('replacing the refresh token drops the old row token with the rotated one', () => {
    const OLD = 'legacy_generated_refresh_token';
    const converted = { secret: { fields: { ...generated.secret.fields, [OLD]: 'rotated-1' } } };
    const replaced = { fields: { RefreshToken: 'refresh-2' } };

    expect(
      applyFieldsUpdate(auth, { ...generated, ...converted }, { RefreshToken: 'refresh-2' }, 'x')
        .secret
    ).toEqual(replaced);
    expect(
      applyCustomConnectorUpdate({ ...custom, ...converted }, { RefreshToken: 'refresh-2' }).secret
    ).toEqual(replaced);
  });

  it('replacing the refresh token drops the rotated one', () => {
    const replaced = { fields: { RefreshToken: 'refresh-2' } };

    expect(update({ RefreshToken: 'refresh-2' })).toEqual({
      generated: replaced,
      custom: replaced,
    });
  });
});

describe('secretFieldKeysWithValue', () => {
  it('lists the secret fields that hold a value, never the values', () => {
    const keys = secretFieldKeysWithValue(aws, {
      secret: { fields: { secretAccessKey: 'secret-access-key-1' } },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
    });

    expect(keys).toEqual(['secretAccessKey']);
  });

  it('finds a secret value stored before its field became secret', () => {
    expect(
      secretFieldKeysWithValue(aws, {
        secret: { fields: { secretAccessKey: 'secret-access-key-1' } },
        publicMetadata: { fields: { accessKeyId: 'key-id-1', sessionToken: 'session-token-1' } },
      })
    ).toEqual(['secretAccessKey', 'sessionToken']);
  });

  it('is empty for a definition without fields', () => {
    expect(
      secretFieldKeysWithValue(
        { type: 'header', label: 'API key', headerName: 'authorization' },
        { secret: { value: 'provider-secret' }, publicMetadata: null }
      )
    ).toEqual([]);
  });
});

describe('google-chat-webhook built-in rule', () => {
  const chat = fieldsAuth('google-chat-webhook');
  const valid = 'https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t';
  const invalid = 'https://example.com/v1/spaces/A/messages?key=k&token=t';
  const message = new BadRequestException('Enter a Google Chat incoming webhook URL.');

  it('accepts a Google Chat webhook URL', () => {
    expect(
      parseFieldsForCreate(chat, { webhookUrl: valid }, 'google-chat-webhook').secret.fields
    ).toEqual({ webhookUrl: valid });
  });

  it('stores the URL it checked, without the whitespace around it', () => {
    const current = { secret: { fields: { webhookUrl: valid } }, publicMetadata: null };

    expect(
      parseFieldsForCreate(chat, { webhookUrl: ` ${valid}\n` }, 'google-chat-webhook').secret.fields
    ).toEqual({ webhookUrl: valid });
    expect(
      applyFieldsUpdate(chat, current, { webhookUrl: `${valid}\n` }, 'google-chat-webhook').secret
        .fields
    ).toEqual({ webhookUrl: valid });
  });

  it('rejects another URL on create without echoing it', () => {
    expect(() =>
      parseFieldsForCreate(chat, { webhookUrl: invalid }, 'google-chat-webhook')
    ).toThrow(message);
  });

  it('rejects another URL on update', () => {
    const current = { secret: { fields: { webhookUrl: valid } }, publicMetadata: null };

    expect(() =>
      applyFieldsUpdate(chat, current, { webhookUrl: invalid }, 'google-chat-webhook')
    ).toThrow(message);
  });

  it('keeps the stored URL without checking it when the update leaves it out', () => {
    // A URL saved before the rule existed must not block an unrelated edit.
    const current = { secret: { fields: { webhookUrl: invalid } }, publicMetadata: null };

    expect(applyFieldsUpdate(chat, current, {}, 'google-chat-webhook')).toEqual({
      secret: { fields: { webhookUrl: invalid } },
      publicMetadata: { fields: {} },
      secretChanged: false,
    });
  });

  it('applies to no other definition', () => {
    expect(builtinFieldRule('aws-access-key', 'accessKeyId', 'x')).toBeNull();
    expect(builtinFieldRule('google-chat-webhook', 'webhookUrl', 'x')).toBe(
      'Enter a Google Chat incoming webhook URL.'
    );
  });
});

describe('secretFieldKeysWithValue of a custom connector', () => {
  it('lists the secret fields of its field list that hold a value', () => {
    expect(
      secretFieldKeysWithValue(
        { type: 'custom-connector' },
        {
          secret: { fields: { token: 't' } },
          publicMetadata: {
            hosts: ['a.example'],
            fieldList: [
              { key: 'token', label: 'Token', secret: true },
              { key: 'region', label: 'Region', secret: false },
              { key: 'extra', label: 'Extra', secret: true },
            ],
            fields: { region: 'eu' },
          },
        }
      )
    ).toEqual(['token']);
  });
});
