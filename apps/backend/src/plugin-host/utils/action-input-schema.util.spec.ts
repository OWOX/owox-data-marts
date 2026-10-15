import Ajv2020 from 'ajv/dist/2020';
import { ACTION_INPUT_AJV, assertBoundedSchema } from './action-input-schema.util';

// The release check's two steps: the static walk, then the compile the validation worker runs.
function compileActionInput(schema: Record<string, unknown>) {
  assertBoundedSchema(schema);
  const ajv = new Ajv2020(ACTION_INPUT_AJV.options);
  ajv.getSchema(ACTION_INPUT_AJV.metaSchema);
  for (const keyword of ACTION_INPUT_AJV.refusedKeywords) ajv.removeKeyword(keyword);
  return ajv.compile(schema);
}

const OVER_BUDGET =
  'exceeds 2000 subschemas, enum entries and dependency names with every $ref inlined';

describe('compileActionInput', () => {
  it('validates input against a draft 2020-12 schema', () => {
    const validate = compileActionInput({
      type: 'object',
      required: ['documentId'],
      properties: { documentId: { type: 'string' } },
    });

    expect(validate({ documentId: 'doc-1' })).toBe(true);
    expect(validate({})).toBe(false);
    expect(
      validate.errors?.map(({ instancePath, message }) => ({ instancePath, message }))
    ).toEqual([{ instancePath: '', message: "must have required property 'documentId'" }]);
  });

  it('reports every error, not only the first', () => {
    const validate = compileActionInput({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
    });

    expect(validate({ a: 1, b: 'x' })).toBe(false);
    expect(validate.errors?.map(error => error.instancePath)).toEqual(['/a', '/b']);
  });

  it.each([
    ['pattern', { type: 'string', pattern: 'x' }],
    ['patternProperties', { type: 'object', patternProperties: { '^a': {} } }],
    ['format', { type: 'string', format: 'email' }],
  ])('refuses the %s keyword', (keyword, schema) => {
    expect(() => compileActionInput(schema)).toThrow(`strict mode: unknown keyword: "${keyword}"`);
  });

  it('refuses a schema of many $ref uses that inlines to more than 2,000 subschemas', () => {
    const shared = Object.fromEntries(
      Array.from({ length: 600 }, (_, index) => [`field${index}`, { type: 'string' }])
    );
    const properties = Object.fromEntries(
      Array.from({ length: 600 }, (_, index) => [`ref${index}`, { $ref: '#/$defs/shared' }])
    );

    expect(() =>
      compileActionInput({
        $defs: { shared: { type: 'object', properties: shared } },
        type: 'object',
        properties,
      })
    ).toThrow(OVER_BUDGET);
  });

  // Inlined: 1 root + 199 × (the $ref, the object, 8 strings) + `strings` nodes.
  function sharedObjectSchema(strings: number): Record<string, unknown> {
    const fields = Array.from({ length: 8 }, (_, index) => [`field${index}`, { type: 'string' }]);
    const refs = Array.from({ length: 199 }, (_, index) => [
      `ref${index}`,
      { $ref: '#/$defs/shared' },
    ]);
    const inline = Array.from({ length: strings }, (_, index) => [
      `inline${index}`,
      { type: 'string' },
    ]);
    return {
      $defs: { shared: { type: 'object', properties: Object.fromEntries(fields) } },
      type: 'object',
      properties: Object.fromEntries([...refs, ...inline]),
    };
  }

  it('compiles a schema of exactly 2,000 subschemas with every $ref inlined', () => {
    expect(compileActionInput(sharedObjectSchema(9))({ ref0: { field0: 'x' } })).toBe(true);
  });

  it('refuses a schema of 2,001 subschemas with every $ref inlined', () => {
    expect(() => compileActionInput(sharedObjectSchema(10))).toThrow(OVER_BUDGET);
  });

  it('refuses an exponential oneOf chain over shared $refs before it validates anything', () => {
    const depth = 30;
    const $defs: Record<string, unknown> = { [`d${depth}`]: { type: 'string' } };
    for (let index = 0; index < depth; index += 1) {
      const next = { $ref: `#/$defs/d${index + 1}` };
      $defs[`d${index}`] = { oneOf: [next, next] };
    }

    expect(() => compileActionInput({ $defs, $ref: '#/$defs/d0' })).toThrow(OVER_BUDGET);
  });

  it.each([
    ['$async', { $async: true, type: 'string' }, 'unsupported keyword: "$async"'],
    [
      'uniqueItems',
      { type: 'array', items: { type: 'object' }, uniqueItems: true },
      'strict mode: unknown keyword: "uniqueItems"',
    ],
    [
      '$dynamicRef',
      { $dynamicAnchor: 'node', $dynamicRef: '#node' },
      'unsupported keyword: "$dynamicRef"',
    ],
    ['$recursiveRef', { $recursiveRef: '#' }, 'unsupported keyword: "$recursiveRef"'],
    [
      'a recursive $ref',
      {
        $defs: { node: { type: 'object', properties: { child: { $ref: '#/$defs/node' } } } },
        $ref: '#/$defs/node',
      },
      '$ref "#/$defs/node" is recursive',
    ],
    [
      'a $ref to the root',
      { type: 'object', properties: { child: { $ref: '#' } } },
      '$ref "#" is recursive',
    ],
    [
      'a non-local $ref',
      { $ref: 'https://example.com/schema.json' },
      '$ref "https://example.com/schema.json" is not local',
    ],
    [
      'a $ref that does not resolve',
      { $defs: { a: { type: 'string' } }, $ref: '#/$defs/b' },
      '$ref "#/$defs/b" does not resolve',
    ],
    [
      'a $ref to an anchor',
      { $defs: { a: { $dynamicAnchor: 'a', type: 'string' } }, $ref: '#a' },
      '$ref "#a" does not resolve',
    ],
    [
      'a $ref through Object.prototype',
      { $ref: '#/constructor' },
      '$ref "#/constructor" does not resolve',
    ],
    [
      'a nested $id',
      {
        type: 'object',
        properties: { a: { $id: 'https://acme.example/a', type: 'string' } },
      },
      '$id is supported only at the root',
    ],
    [
      'a $ref through a nested $id',
      {
        $defs: {
          r: { $id: 'https://acme.example/r', $defs: { s: { type: 'string' } } },
        },
        $ref: '#/$defs/r/$defs/s',
      },
      '$id is supported only at the root',
    ],
    // ajv strips a trailing `#` and applies `$defs['']`, not the `$defs['#']` a split would cost.
    [
      'a $ref ending in #',
      { $defs: { '#': { const: 1 }, '': { const: 2 } }, $ref: '#/$defs/#' },
      '$ref "#/$defs/#" has "#" after its first character',
    ],
    [
      'a recursion hidden behind a $ref ending in #',
      { $defs: { '#': { type: 'string' }, '': { allOf: [{ $ref: '#' }] } }, $ref: '#/$defs/#' },
      '$ref "#/$defs/#" has "#" after its first character',
    ],
    [
      'a $ref with # inside a segment',
      { $defs: { 'a#': { type: 'string' }, a: { type: 'number' } }, $ref: '#/$defs/a#' },
      '$ref "#/$defs/a#" has "#" after its first character',
    ],
  ])('refuses %s', (_label, schema, reason) => {
    expect(() => compileActionInput(schema)).toThrow(reason);
  });

  const names = (count: number) => Array.from({ length: count }, (_, index) => `n${index}`);
  const sharedRefs = (count: number, target: string) =>
    Array.from({ length: count }, () => ({ $ref: target }));

  it.each([
    [
      'enum entries behind 700 shared $refs',
      {
        $defs: { e: { enum: Array.from({ length: 3600 }, (_, index) => index) } },
        type: 'array',
        items: { allOf: sharedRefs(700, '#/$defs/e') },
      },
    ],
    [
      'dependentRequired names behind 300 shared $refs',
      {
        $defs: { d: { type: 'object', dependentRequired: { a: names(2500) } } },
        type: 'array',
        items: { allOf: sharedRefs(300, '#/$defs/d') },
      },
    ],
    ['an enum of 2,000 entries', { enum: Array.from({ length: 2000 }, (_, index) => index) }],
    ['dependencies names', { type: 'object', dependencies: { a: names(2000) } }],
  ])('counts %s toward the inlined budget', (_label, schema) => {
    expect(() => compileActionInput(schema)).toThrow(OVER_BUDGET);
  });

  it('reads properties named $ref, $async and $id as properties, not keywords', () => {
    const validate = compileActionInput({
      type: 'object',
      properties: {
        $ref: { type: 'string' },
        $async: { type: 'boolean' },
        $id: { type: 'number' },
      },
    });

    expect(validate({ $ref: 'x', $async: true, $id: 1 })).toBe(true);
    expect(validate({ $ref: 1 })).toBe(false);
  });

  it('resolves a $ref through a properties map that has a property named $id', () => {
    const validate = compileActionInput({
      type: 'object',
      properties: { $id: { type: 'string' }, x: { type: 'number' } },
      additionalProperties: { $ref: '#/properties/x' },
    });

    expect(validate({ y: 1 })).toBe(true);
    expect(validate({ y: 'a' })).toBe(false);
  });

  it('resolves escaped JSON Pointer segments the way ajv does', () => {
    const validate = compileActionInput({
      $defs: { 'a/b': { type: 'string' }, 'c~d': { type: 'number' }, 'e f': { type: 'boolean' } },
      type: 'object',
      properties: {
        slash: { $ref: '#/$defs/a~1b' },
        tilde: { $ref: '#/$defs/c~0d' },
        space: { $ref: '#/$defs/e%20f' },
      },
    });

    expect(validate({ slash: 'x', tilde: 1, space: true })).toBe(true);
    expect(validate({ slash: 1 })).toBe(false);
  });

  it('compiles two schemas with the same $id independently', () => {
    const schema = { $id: 'https://acme.example/input', type: 'string' };

    expect(() => {
      compileActionInput(schema);
      compileActionInput(schema);
    }).not.toThrow();
  });
});
