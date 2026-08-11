# Connector Fixtures

Real-config integration tests for connectors. Fixtures contain credentials -
they are gitignored.

## Capture

1. From staging MySQL, find a successful `data_mart_run`:

   ```sql
   SELECT id, definitionRun, status, runType FROM data_mart_run
   WHERE status='SUCCESS' AND type='CONNECTOR' ORDER BY createdAt DESC LIMIT 5;
   ```

2. Copy `definitionRun` JSON.
3. From `connector_source_credentials` (or your secrets store), copy the
   credential values referenced by
   `definitionRun.connector.source.configuration[]._id`.
4. From `data_storage_credentials` / `data_storage`, copy storage config
   (project, dataset, table, OAuth/Service Account).
5. (Optional) From `connector_state`, copy state JSON.
6. Compose a `*.fixture.json` matching the example template.

## Run

Single fixture:

```sh
npm run fixture -- tests/fixtures/myfixture.fixture.json
```

All fixtures via test runner:

```sh
npm run test:fixtures
```

## Notes

- `*.fixture.json` is gitignored - never commit real credentials.
- Storage is mocked (in-memory). No writes to BigQuery / Snowflake / etc.
- Networking IS real - the connector hits real APIs (Bank of Canada,
  Google Ads, etc.) using your captured credentials.
