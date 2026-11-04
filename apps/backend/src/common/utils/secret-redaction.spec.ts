import { createSecretRedactor } from './secret-redaction';

const policies = [
  { label: 'MCP', replacement: '[REDACTED]', minimumSubstringLength: 4 },
  { label: 'connector tests', replacement: '***', minimumSubstringLength: 6 },
];
const secrets = [
  { label: 'text', secret: 'sk_live_A1B2C3D4', echoes: ['sk_live_A1B2C3D4'] },
  { label: 'number', secret: 123456, echoes: [123456, '123456'] },
  { label: 'numeric string', secret: '123456', echoes: [123456, '123456'] },
  { label: 'negative decimal', secret: -123456.75, echoes: [-123456.75, '-123456.75'] },
  { label: 'zero', secret: 0, echoes: [0, '0'] },
  { label: 'short text', secret: 'abc', echoes: ['abc'] },
  {
    label: 'URL and JSON characters',
    secret: 'pa"ss word/1',
    echoes: ['pa"ss word/1', 'pa%22ss%20word%2F1', 'pa\\"ss word/1'],
  },
  {
    label: 'Unicode',
    secret: 'ключ🔐',
    echoes: ['ключ🔐', '%D0%BA%D0%BB%D1%8E%D1%87%F0%9F%94%90'],
  },
  {
    label: 'unpaired surrogate',
    secret: 'foo\ud800bar',
    echoes: ['foo\ud800bar', 'foo\\ud800bar'],
  },
];

describe.each(policies)('secret redaction for $label', policy => {
  it.each(secrets)('masks $label in JSON values, keys and nested arrays', ({ secret, echoes }) => {
    const redact = createSecretRedactor([secret], policy);
    for (const echo of echoes) {
      const input = {
        rows: [{ [String(echo)]: { value: echo }, publicValue: 42 }],
        sample: [[echo, { items: [{ value: echo }] }]],
        region: 'eu',
        enabled: true,
        empty: null,
      };
      const before = structuredClone(input);
      const output = redact(input);

      expect(output).toEqual({
        rows: [{ [policy.replacement]: { value: policy.replacement }, publicValue: 42 }],
        sample: [[policy.replacement, { items: [{ value: policy.replacement }] }]],
        region: 'eu',
        enabled: true,
        empty: null,
      });
      expect(redact(output)).toEqual(output);
      expect(input).toEqual(before);
    }
  });

  it.each(secrets.filter(({ secret }) => String(secret).length >= 6))(
    'masks $label inside text and object keys',
    ({ secret, echoes }) => {
      const redact = createSecretRedactor([secret], policy);
      for (const echo of echoes) {
        expect(redact({ [`prefix-${echo}`]: `Rejected ${echo}.` })).toEqual({
          [`prefix-${policy.replacement}`]: `Rejected ${policy.replacement}.`,
        });
      }
    }
  );

  it('preserves ordinary text containing short values', () => {
    expect(
      createSecretRedactor(
        ['abc', 0],
        policy
      )({
        exact: 'abc',
        number: 0,
        text: 'abc 0 abcde',
        abc: 7,
      })
    ).toEqual({
      exact: policy.replacement,
      number: policy.replacement,
      text: 'abc 0 abcde',
      [policy.replacement]: 7,
    });
  });

  it('masks a long encoded representation of a short secret', () => {
    const redact = createSecretRedactor(['🔐'], policy);
    expect(redact('Value %F0%9F%94%90')).toBe(`Value ${policy.replacement}`);
  });

  it('masks known values inside template-shaped output', () => {
    expect(createSecretRedactor(['private-value'], policy)('{{ parameters.private-value }}')).toBe(
      `{{ parameters.${policy.replacement} }}`
    );
  });

  it('replaces overlapping values in one pass without changing existing masks', () => {
    const redact = createSecretRedactor(
      ['long-secret', 'long-secret-more', 'REDACTED', '*'],
      policy
    );
    const expected = `${policy.replacement} ${policy.replacement} ${policy.replacement}`;
    expect(redact(`long-secret-more long-secret ${policy.replacement}`)).toBe(expected);
    expect(redact(expected)).toBe(expected);
  });

  it('does not treat credential characters as regular expression syntax', () => {
    const redact = createSecretRedactor(['ab.*+?^${}()|[]\\/cd'], policy);
    expect(redact('Value ab.*+?^${}()|[]\\/cd')).toBe(`Value ${policy.replacement}`);
    expect(redact('Value ab123cd')).toBe('Value ab123cd');
  });

  it('keeps prototype-like keys as data without changing Object.prototype', () => {
    const redact = createSecretRedactor(['private-value'], policy);
    const output = redact(JSON.parse('{"__proto__":{"value":"private-value"}}'));
    expect(output).toEqual(JSON.parse(`{"__proto__":{"value":"${policy.replacement}"}}`));
    expect(Object.prototype).not.toHaveProperty('value');
  });

  it('ignores empty values and non-finite numbers', () => {
    const input = { value: '', count: 0, text: 'NaN Infinity', other: false };
    expect(createSecretRedactor(['', NaN, Infinity], policy)(input)).toEqual(input);
  });
});
