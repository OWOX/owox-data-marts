import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';

/**
 * Field statuses are server-owned (a save keeps unverified native fields DISCONNECTED) and the e2e
 * storages have no warehouse to actualize against, so the schema is written straight into the DB
 * with the statuses given, then saved through the API so calculated fields get the real save.
 */
export async function setDataMartSchema(
  agent: supertest.Agent,
  app: INestApplication,
  dataMartId: string,
  schema: Record<string, unknown>
): Promise<supertest.Response> {
  const backendDir = require('path').dirname(require.resolve('@owox/backend/package.json'));
  const { DataSource } = require(require.resolve('typeorm', { paths: [backendDir] }));
  await app
    .get(DataSource)
    .query('UPDATE data_mart SET schema = ? WHERE id = ?', [JSON.stringify(schema), dataMartId]);

  const res = await agent
    .put(`/api/data-marts/${dataMartId}/schema`)
    .set(AUTH_HEADER)
    .send({ schema });
  if (res.status !== 200) {
    throw new Error(
      `PUT /api/data-marts/${dataMartId}/schema failed: ${res.status} ${JSON.stringify(res.body)}`
    );
  }
  return res;
}
