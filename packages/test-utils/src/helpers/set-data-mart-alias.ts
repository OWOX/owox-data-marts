import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';

interface DataMartSchemaField {
  name: string;
  alias?: string | null;
  [key: string]: unknown;
}

interface DataMartSchemaPayload {
  type?: string;
  fields: DataMartSchemaField[];
  [key: string]: unknown;
}

interface DataMartResponse {
  id: string;
  schema?: DataMartSchemaPayload;
  [key: string]: unknown;
}

/**
 * Sets (or clears) the alias on a single Output Schema field of a data mart.
 *
 * The backend exposes only a full-schema replace endpoint
 * (`PUT /api/data-marts/:id/schema`), so we round-trip the entire schema
 * payload, mutate just the targeted field, and put it back. No republish is
 * required — alias is a presentation-layer field, not part of the SQL
 * definition contract.
 *
 * @param fieldName  the canonical column `name` to mutate
 * @param alias      new alias; pass `null` to clear an existing alias
 */
export async function setDataMartAlias(
  agent: supertest.Agent,
  dataMartId: string,
  fieldName: string,
  alias: string | null
): Promise<void> {
  const getRes = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
  expect(getRes.status).toBe(200);
  const dataMart = getRes.body as DataMartResponse;

  const schema = dataMart.schema;
  if (!schema || !Array.isArray(schema.fields)) {
    throw new Error(
      `Data mart ${dataMartId} has no schema yet — cannot set alias on field "${fieldName}". ` +
        `Make sure the schema is actualized (POST /schema-actualize-triggers) before calling this helper.`
    );
  }

  const target = schema.fields.find(f => f.name === fieldName);
  if (!target) {
    const known = schema.fields.map(f => f.name).join(', ');
    throw new Error(
      `Field "${fieldName}" not found in data mart ${dataMartId} schema. Available: ${known}`
    );
  }

  if (alias === null) {
    delete target.alias;
  } else {
    target.alias = alias;
  }

  const putRes = await agent
    .put(`/api/data-marts/${dataMartId}/schema`)
    .set(AUTH_HEADER)
    .send({ schema });
  expect(putRes.status).toBe(200);
}
