import type { CredentialSecret } from '../../credentials/credential.types';
import { materialKey } from '../../credentials/services/credential-material-key';
import { groupConversionItems } from './grouping';

const SA_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'p',
  private_key_id: 'k',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@p.iam.gserviceaccount.com',
});

function oauth(refresh_token: string | undefined, access_token = 'access-1'): CredentialSecret {
  return {
    oauth: {
      provider: 'google',
      clientId: 'storage-client',
      tokens: {
        access_token,
        refresh_token,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/bigquery openid',
        expiry_date: 1,
      },
    },
  };
}

function item(id: string, definitionId: string, ownerIds: string[], key: string) {
  return { id, projectId: 'project-1', definitionId, ownerIds, materialKey: key };
}

function ids(groups: { id: string }[][]): string[][] {
  return groups.map(group => group.map(entry => entry.id));
}

describe('storage credential conversion grouping', () => {
  it('groups identical service account keys of the same owners', () => {
    const a = materialKey('google-service-account', { value: SA_KEY }, null);
    const b = materialKey(
      'google-service-account',
      // Key order and empty fields do not change the material.
      { value: JSON.stringify({ ...JSON.parse(SA_KEY), client_id: '' }) },
      null
    );

    expect(
      ids(
        groupConversionItems([
          item('s1', 'google-service-account', ['u1', 'u2'], a),
          item('s2', 'google-service-account', ['u1', 'u2'], b),
        ])
      )
    ).toEqual([['s1', 's2']]);
  });

  it('keeps identical keys of different owners apart', () => {
    const key = materialKey('google-service-account', { value: SA_KEY }, null);

    expect(
      ids(
        groupConversionItems([
          item('s1', 'google-service-account', ['u1'], key),
          item('s2', 'google-service-account', ['u2'], key),
          item('s3', 'google-service-account', [], key),
        ])
      )
    ).toEqual([['s1'], ['s2'], ['s3']]);
  });

  it('treats an absent AWS session token as an empty one', () => {
    const metadata = { fields: { accessKeyId: 'AKIA1' } };
    const absent = materialKey('aws-access-key', { fields: { secretAccessKey: 's' } }, metadata);
    const empty = materialKey(
      'aws-access-key',
      { fields: { secretAccessKey: 's', sessionToken: '' } },
      metadata
    );
    const other = materialKey('aws-access-key', { fields: { secretAccessKey: 's2' } }, metadata);

    expect(absent).toBe(empty);
    expect(other).not.toBe(absent);
    expect(
      ids(
        groupConversionItems([
          item('s1', 'aws-access-key', ['u1'], absent),
          item('s2', 'aws-access-key', ['u1'], empty),
          item('s3', 'aws-access-key', ['u1'], other),
        ])
      )
    ).toEqual([['s1', 's2'], ['s3']]);
  });

  it('groups OAuth rows of the same grant whatever their access tokens', () => {
    const a = materialKey('google-oauth', oauth('refresh-1', 'access-1'), null);
    const b = materialKey('google-oauth', oauth('refresh-1', 'access-2'), null);
    const other = materialKey('google-oauth', oauth('refresh-2'), null);

    expect(
      ids(
        groupConversionItems([
          item('s1', 'google-oauth', ['u1'], a),
          item('s2', 'google-oauth', ['u1'], b),
          item('s3', 'google-oauth', ['u1'], other),
        ])
      )
    ).toEqual([['s1', 's2'], ['s3']]);
  });

  it('keeps OAuth rows without a refresh token apart', () => {
    const secret = oauth(undefined);

    expect(
      ids(
        groupConversionItems([
          item('s1', 'google-oauth', ['u1'], materialKey('google-oauth', secret, null)),
          item('s2', 'google-oauth', ['u1'], materialKey('google-oauth', secret, null)),
        ])
      )
    ).toEqual([['s1'], ['s2']]);
  });
});
