# Google BigQuery Storage

## Description

Storage for Google BigQuery

## Retries

BigQuery sometimes rejects a query with a temporary fault, such as `backendError` or
`rateLimitExceeded`. The storage waits and runs that query again instead of failing the
run, reusing the connector's **Max Fetch Retries** and **Initial Retry Delay** settings.
Faults that another attempt cannot fix, such as an invalid query or a denied permission,
are reported straight away.

## Environments

This storage works in the following environments:

- ✅ Node.js

## Dependencies

Node.js

- `@google-cloud/bigquery`

## License

MIT
