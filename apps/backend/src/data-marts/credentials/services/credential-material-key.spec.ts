import { materialKey } from './credential-material-key';

const SA_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'p',
  private_key_id: 'k',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@p.iam.gserviceaccount.com',
});

describe('materialKey', () => {
  it('keeps values that differ only by surrounding whitespace apart', () => {
    const metadata = { fields: { accessKeyId: 'AKIA1' } };
    const key = (secretAccessKey: string) =>
      materialKey('aws-access-key', { fields: { secretAccessKey } }, metadata);
    const sa = (projectId: string) =>
      materialKey(
        'google-service-account',
        { value: JSON.stringify({ ...JSON.parse(SA_KEY), project_id: projectId }) },
        null
      );

    expect(key(' secret ')).not.toBe(key('secret'));
    expect(sa(' p ')).not.toBe(sa('p'));
    for (const [padded, plain] of [
      [' token ', 'token'],
      [' 123 ', '123'],
    ]) {
      expect(materialKey('github', { value: padded }, null)).not.toBe(
        materialKey('github', { value: plain }, null)
      );
    }
  });

  it('treats a blank field as an absent one', () => {
    const metadata = { fields: { accessKeyId: 'AKIA1' } };

    expect(
      materialKey(
        'aws-access-key',
        { fields: { secretAccessKey: 's', sessionToken: ' ' } },
        metadata
      )
    ).toBe(materialKey('aws-access-key', { fields: { secretAccessKey: 's' } }, metadata));
  });

  it('compares a value that is not JSON as the string itself', () => {
    const key = (value: string) => materialKey('google-service-account', { value }, null);

    expect(key('plain-key')).toBe(key('plain-key'));
    expect(key('plain-key')).not.toBe(key('other-key'));
  });
});

describe('materialKey of a custom connector', () => {
  const spec = { key: 'token', label: 'Token', secret: true };
  const key = (hosts: string[], fieldList = [spec]) =>
    materialKey('custom-connector', { fields: { token: 't' } }, { hosts, fieldList, fields: {} });

  it('differs when hosts differ', () => {
    expect(key(['a.example'])).not.toBe(key(['b.example']));
    expect(key(['a.example'])).toBe(key(['a.example']));
  });

  it('differs when the field list differs', () => {
    expect(key(['a.example'])).not.toBe(key(['a.example'], [{ ...spec, label: 'Other' }]));
  });

  it('keeps a value apart from hosts and the field list of the same name', () => {
    const named = (hosts: string[], value: string) =>
      materialKey(
        'custom-connector',
        { fields: { hosts: value } },
        { hosts, fieldList: [{ key: 'hosts', label: 'Hosts', secret: true }], fields: {} }
      );

    expect(named(['a.example'], 'token-1')).not.toBe(named(['b.example'], 'token-1'));
  });
});
