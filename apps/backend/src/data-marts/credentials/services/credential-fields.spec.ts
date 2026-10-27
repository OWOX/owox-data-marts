import { BadRequestException } from '@nestjs/common';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';
import {
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

describe('applyFieldsUpdate', () => {
  const current = {
    secret: { fields: { secretAccessKey: 'secret-access-key-1', sessionToken: 'session-token-1' } },
    publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
  };

  it('keeps an omitted field', () => {
    expect(applyFieldsUpdate(aws, current, { accessKeyId: 'key-id-2' }, 'aws-access-key')).toEqual({
      secret: current.secret,
      publicMetadata: { fields: { accessKeyId: 'key-id-2' } },
      secretChanged: true,
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

  it('counts a new identity as a secret change, but not the same identity sent again', () => {
    expect(
      applyFieldsUpdate(aws, current, { accessKeyId: 'key-id-2' }, 'aws-access-key').secretChanged
    ).toBe(true);
    expect(
      applyFieldsUpdate(aws, current, { accessKeyId: 'key-id-1' }, 'aws-access-key').secretChanged
    ).toBe(false);
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
