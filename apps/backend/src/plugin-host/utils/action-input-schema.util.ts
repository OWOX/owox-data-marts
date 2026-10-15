import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/** A publisher regex can backtrack catastrophically, and `uniqueItems` deep-compares every pair. */
const REFUSED_KEYWORDS = ['pattern', 'patternProperties', 'format', 'uniqueItems'] as const;

/** `$async` returns a Promise; the dynamic refs resolve at run time, outside the inlined cost. */
const UNSUPPORTED_KEYWORDS = ['$async', '$dynamicRef', '$recursiveRef'] as const;

const SUBSCHEMA_KEYWORDS = [
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
] as const;
const SUBSCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;
const SUBSCHEMA_MAP_KEYWORDS = [
  'dependencies',
  'dependentSchemas',
  'patternProperties',
  'properties',
] as const;

/** Pointer segments after which ajv ignores an `$id`: their values are maps or data, not schemas. */
const PREVENT_SCOPE_CHANGE = new Set([
  'properties',
  'patternProperties',
  'enum',
  'dependencies',
  'definitions',
]);

/** What the validation worker builds ajv from, a fresh instance per schema so `$id`s never meet. */
export const ACTION_INPUT_AJV = {
  options: { strict: true, allErrors: true, logger: false, inlineRefs: false, ownProperties: true },
  metaSchema: DRAFT_2020_12,
  refusedKeywords: REFUSED_KEYWORDS,
} as const;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

/** A nested `$id` would rebase the `#` refs below it, so every ref here resolves from the root. */
function resolveLocalRef(root: JsonObject, ref: string): unknown {
  if (!ref.startsWith('#')) {
    throw new Error(`$ref "${ref}" is not local`);
  }
  // ajv strips a trailing `#` or `#/` first; refusing any later `#` keeps the costed target ajv's.
  if (ref.includes('#', 1)) {
    throw new Error(`$ref "${ref}" has "#" after its first character`);
  }
  if (ref === '#') return root;
  const unresolved = new Error(`$ref "${ref}" does not resolve`);
  if (!ref.startsWith('#/')) throw unresolved;

  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    let key: string;
    try {
      key = decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~');
    } catch {
      throw unresolved;
    }
    if (!isObject(node) || !Object.hasOwn(node, key)) throw unresolved;
    node = node[key];
    if (!PREVENT_SCOPE_CHANGE.has(part) && isObject(node) && Object.hasOwn(node, '$id')) {
      throw new Error('$id is supported only at the root');
    }
  }
  return node;
}

/** `enum` and dependency name lists are checked per input value, so each entry costs a node. */
function countPayload(schema: JsonObject): number {
  let entries = Array.isArray(schema.enum) ? schema.enum.length : 0;
  for (const keyword of ['dependentRequired', 'dependencies']) {
    const map = schema[keyword];
    if (!isObject(map)) continue;
    for (const names of Object.values(map)) {
      if (Array.isArray(names)) entries += names.length;
    }
  }
  return entries;
}

/** Walks the subschemas ajv applies with every `$ref` inlined: `oneOf` over a shared ref is exponential. */
export function assertBoundedSchema(root: JsonObject): void {
  const limit = PLUGIN_ACTION_LIMITS.maxInputSchemaNodes;
  const expanding = new Set<JsonObject>();
  let nodes = 0;
  const count = (cost: number): void => {
    nodes += cost;
    if (nodes > limit) {
      throw new Error(
        `exceeds ${limit} subschemas, enum entries and dependency names with every $ref inlined`
      );
    }
  };

  const visit = (schema: unknown): void => {
    count(1);
    if (!isObject(schema)) return;
    count(countPayload(schema));

    const unsupported = UNSUPPORTED_KEYWORDS.find(keyword => Object.hasOwn(schema, keyword));
    if (unsupported) throw new Error(`unsupported keyword: "${unsupported}"`);
    if (schema !== root && Object.hasOwn(schema, '$id')) {
      throw new Error('$id is supported only at the root');
    }

    expanding.add(schema);
    if (typeof schema.$ref === 'string') {
      const target = resolveLocalRef(root, schema.$ref);
      if (isObject(target) && expanding.has(target)) {
        throw new Error(`$ref "${schema.$ref}" is recursive`);
      }
      visit(target);
    }
    for (const keyword of SUBSCHEMA_KEYWORDS) {
      if (Object.hasOwn(schema, keyword)) visit(schema[keyword]);
    }
    for (const keyword of SUBSCHEMA_LIST_KEYWORDS) {
      const list = schema[keyword];
      if (Array.isArray(list)) list.forEach(visit);
    }
    for (const keyword of SUBSCHEMA_MAP_KEYWORDS) {
      const map = schema[keyword];
      if (isObject(map)) Object.values(map).forEach(visit);
    }
    expanding.delete(schema);
  };

  visit(root);
}
