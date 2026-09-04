# Google BigQuery Storage

## Description

Storage for Google BigQuery

## Retries

BigQuery sometimes fails a query with a temporary fault, such as `backendError`.
The storage waits and runs that query again instead of failing the run.
It reuses the connector's **Max Fetch Retries** and **Initial Retry Delay** settings.
Each wait doubles the previous one, up to one minute.

Some faults no further attempt can fix, such as an invalid query or a denied
permission. The storage reports those straight away.

## Environments

This storage works in the following environments:

- ✅ Node.js

## Dependencies

Node.js

- `@google-cloud/bigquery`

## License

MIT
