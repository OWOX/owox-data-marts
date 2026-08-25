import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  AUTH_HEADER,
} from '@owox/test-utils';
import { SqlDryRunExecutorFacade } from 'src/data-marts/data-storage-types/facades/sql-dry-run-executor.facade';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import type { IdpProvider, Payload } from '@owox/idp-protocol';

// The formula editor's live channel: POST /api/data-marts/:id/schema/validate-formula answers
// "what is wrong with this formula" from the parser pass alone.
//
// What this file covers: routing, auth, status codes, the response shape, and that the rules
// reaching the wire are the real ones. What it does NOT establish on its own is that the endpoint
// avoids a warehouse call it could otherwise have made — this fixture's storage is created through
// `POST /api/data-storages` with no config, so `update-data-mart-schema` would skip the dry run for
// this Data Mart too (`storageConfig && calculatedFields.length > 0`). The discriminating proof
// lives in validate-formula.service.spec.ts, whose fixture deliberately carries a storage config
// and asserts both the dry-run facade and the composer stay untouched.
//
// The `dryRunFacadeMock` assertions below are kept as a cheap regression guard, and the wiring
// assertion in the first test closes the hole they would otherwise leave: without it, an override
// that silently failed to bind would leave the mock untouched for the wrong reason and every
// "not called" assertion would still pass.

const EDITOR_AUTH_HEADER = { 'x-owox-authorization': 'editor-token' };

const ADMIN_PAYLOAD: Payload = {
  userId: '0',
  email: 'admin@localhost',
  roles: ['admin'],
  fullName: 'Admin',
  projectId: '0',
};
const EDITOR_PAYLOAD: Payload = {
  userId: '1',
  email: 'editor@localhost',
  roles: ['editor'],
  fullName: 'Technical User',
  projectId: '0',
};

function resolvePayload(token: string): Payload {
  return token.startsWith('editor') ? EDITOR_PAYLOAD : ADMIN_PAYLOAD;
}

describe('Formula live validation API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;

  const dryRunFacadeMock = {
    execute: jest.fn(async () => ({ isValid: true })),
  };

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: SqlDryRunExecutorFacade, useValue: dryRunFacadeMock },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const expressApp = (
      app.getHttpAdapter() as { getInstance(): Express.Application }
    ).getInstance();
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest
      .spyOn(idpProvider, 'introspectToken')
      .mockImplementation(async token => resolvePayload(token));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async token => resolvePayload(token));

    const facade = app.get(IdpProjectionsFacade);
    jest
      .spyOn(facade, 'getProjectMembers')
      .mockResolvedValue([
        new ProjectMemberDto('0', 'admin@localhost', 'Admin', undefined, 'admin', true, false),
        new ProjectMemberDto(
          '1',
          'editor@localhost',
          'Technical User',
          undefined,
          'editor',
          true,
          false
        ),
      ]);

    const prereqs = await setupReportPrerequisites(agent);
    dataMartId = prereqs.dataMartId;

    const schemaRes = await agent
      .put(`/api/data-marts/${dataMartId}/schema`)
      .set(AUTH_HEADER)
      .send({
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
            { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
            // A metric that already exists, so a request can be shown breaking something other
            // than the field it names.
            {
              name: 'roas',
              type: 'FLOAT',
              mode: 'NULLABLE',
              status: 'CONNECTED',
              calculated: {
                formula:
                  'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
                level: 'metric',
              },
            },
          ],
        },
      });
    expect(schemaRes.status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    dryRunFacadeMock.execute.mockClear();
  });

  // Not "without touching the warehouse": this fixture's storage has no config, so the SAVE would
  // skip the dry run for it too (see the header). What it does establish is the wiring — the
  // container really hands out this mock — which is what every `not.toHaveBeenCalled()` below
  // rests on. The discriminating proof is in validate-formula.service.spec.ts.
  it('reports a structural violation, with the dry-run facade wired and untouched', async () => {
    // Positive control for every `not.toHaveBeenCalled()` in this file: the container really does
    // hand this mock to whatever injects the facade, so an untouched mock means "not called"
    // rather than "not wired".
    expect(app.get(SqlDryRunExecutorFacade)).toBe(dryRunFacadeMock);

    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'ctr', type: 'FLOAT', formula: 'SUM(SUM({{ref field="clicks"}}))' });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.errors)).toContain('FORMULA_NESTED_AGGREGATE');
    expect(dryRunFacadeMock.execute).not.toHaveBeenCalled();
  });

  it('accepts a valid formula', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({
        name: 'ctr',
        type: 'FLOAT',
        formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(dryRunFacadeMock.execute).not.toHaveBeenCalled();
  });

  // The same advisory the save returns, from the same rule — the whole point of reusing the
  // validator is that the live channel cannot disagree with the save about anything.
  it('returns the unguarded-division warning without erroring', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({
        name: 'ctr',
        type: 'FLOAT',
        formula: 'SUM({{ref field="clicks"}}) / SUM({{ref field="impressions"}})',
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr' }),
      ])
    );
  });

  // A sibling reference resolves against the PERSISTED schema, exactly as it will at save time.
  //
  // `subject` is asserted here because this is the only place it can be: the web pins that it
  // CONSUMES the field, but nothing on this side pinned that the wire carries it. A mapper that
  // dropped it would pass every backend suite, and the editor would fall back to parsing the
  // leading backticked word out of English prose — re-coupling marker placement to wording, which
  // is exactly what publishing it as data undid.
  it('refuses a reference to a field the persisted schema does not have, naming the token', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'ctr', type: 'FLOAT', formula: 'SUM({{ref field="clcks"}})' });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FORMULA_UNKNOWN_REFERENCE',
          field: 'ctr',
          subject: 'clcks',
        }),
      ])
    );
  });

  /**
   * The wire half of the deferred-save fix, and the only place it can be established: the
   * global pipe runs `forbidNonWhitelisted`, so a DTO that failed to declare `calculatedFields`
   * answers 400 for every live check the editor makes — while every unit test on both sides keeps
   * passing, because neither of them goes through the pipe.
   */
  it('resolves a sibling formula that exists only in the caller’s unsaved draft', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({
        name: 'roi',
        type: 'FLOAT',
        formula: '{{ref field="revenue"}} / {{ref field="cost"}}',
        calculatedFields: [
          { name: 'revenue', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}})' },
          { name: 'cost', type: 'FLOAT', formula: 'SUM({{ref field="impressions"}})' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    // The persisted `roas` is not among them either: the draft replaced it, and a formula the
    // editor no longer holds is not a reason this save would fail.
    expect(res.body.otherFieldErrors).toEqual([]);
  });

  it('refuses a draft entry carrying no name, rather than judging a nameless formula', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({
        name: 'roi',
        type: 'FLOAT',
        formula: 'SUM({{ref field="clicks"}})',
        calculatedFields: [{ name: '', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}})' }],
      });

    expect(res.status).toBe(400);
  });

  // Substitution, not blind appending: submitting under the name of an existing field REPLACES it,
  // so the formula sees the schema the save would produce. Appending instead would leave the real
  // `impressions` column in place and report nothing here.
  it('replaces the same-named field, so referencing it reads as a self-reference', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'impressions', type: 'FLOAT', formula: 'SUM({{ref field="impressions"}})' });

    expect(res.status).toBe(200);
    // The refusal that MEANS "you named yourself" is the cycle one; the calculated-reference
    // refusal that used to say so caught it only incidentally and has since been lifted.
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FORMULA_CIRCULAR_REFERENCE',
          field: 'impressions',
        }),
      ])
    );
  });

  // The submitted formula is legal on its own terms and still fails the save — because turning
  // `impressions` into a metric breaks the persisted `roas`, whose violation is filed under `roas`.
  // Scoped to the edited field alone, this request would look green and then 400 on Save, naming a
  // metric the analyst never opened.
  it('reports what saving this formula would break elsewhere', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'impressions', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}}) * 2' });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    // `roas` MAY read `impressions` — what it may not do is wrap an aggregate-level
    // formula in another aggregate. The code changed with the feature; the attribution did not.
    expect(res.body.otherFieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORMULA_AGGREGATE_ON_AGGREGATE', field: 'roas' }),
      ])
    );

    // …and the save really does refuse it, which is what makes the bucket above worth reporting.
    const save = await agent
      .put(`/api/data-marts/${dataMartId}/schema`)
      .set(AUTH_HEADER)
      .send({
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
            {
              name: 'impressions',
              type: 'FLOAT',
              mode: 'NULLABLE',
              status: 'CONNECTED',
              calculated: { formula: 'SUM({{ref field="clicks"}}) * 2', level: 'metric' },
            },
            {
              name: 'roas',
              type: 'FLOAT',
              mode: 'NULLABLE',
              status: 'CONNECTED',
              calculated: {
                formula:
                  'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
                level: 'metric',
              },
            },
          ],
        },
      });
    expect(save.status).toBe(400);
    expect(save.body.errorDetails.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORMULA_AGGREGATE_ON_AGGREGATE', field: 'roas' }),
      ])
    );
  });

  // 200 with a violation, not a 4xx: an unusable answer and a failed request are the same thing to
  // this client — an empty diagnostics panel, which reads as "your formula is clean" — and three
  // failed requests disable the channel for the session.
  it('reports a field type the storage does not know as a violation, not a failed request', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'ctr', type: 'BANANA', formula: 'SUM({{ref field="clicks"}})' });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        code: 'FORMULA_FIELD_TYPE_NOT_SUPPORTED',
        field: 'ctr',
        subject: 'BANANA',
      }),
    ]);
  });

  // A joined path is resolved with the CALLER's own accessor, so a path naming no source is
  // refused here exactly as the save refuses it (PUT schema asserts the same code).
  it('refuses a joined path that names no source', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'ctr', type: 'FLOAT', formula: 'SUM({{ref path="orders" field="revenue"}})' });

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORMULA_JOINED_PATH_NOT_FOUND', field: 'ctr' }),
      ])
    );
    expect(dryRunFacadeMock.execute).not.toHaveBeenCalled();
  });

  it('rejects a body with no formula', async () => {
    const res = await agent
      .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
      .set(AUTH_HEADER)
      .send({ name: 'ctr', type: 'FLOAT' });

    expect(res.status).toBe(400);
  });

  describe('access control', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    // The endpoint answers questions about a Data Mart's fields, so it must not become a way to
    // probe one the caller cannot see: same refusal the Data Mart's own GET gives.
    it('refuses a Data Mart the caller cannot see', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/schema/validate-formula`)
        .set(EDITOR_AUTH_HEADER)
        .send({ name: 'ctr', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}})' });

      expect(res.status).toBe(403);
    });
  });
});
