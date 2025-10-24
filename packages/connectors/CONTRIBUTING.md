# How to Contribute

There are thousands of data sources and their APIs constantly evolve, so no single team can build and maintain every connector. Within the OWOX Data Marts project we collaborate as a community to share this responsibility, and this guide explains how you can work with us to adjust existing integrations and create new ones.

When contributing, please keep the wider community in mind. We review pull requests for technical quality and for how broadly the connector can be applied beyond the contributor's specific scenario. If you plan work that cannot be contributed back, be ready to maintain your own fork. We highly recommend designing every connector so that it can be upstreamed when requirements allow.

## Prerequisites

Set up the following tools locally before you start developing:

- Node.js 22.16.0 or later (see `engines.node` requirement in root `package.json`)
- npm 10 or later (ships with the Node 22 installer)
- Git (any recent 2.x release) for working with the repository

After installing the tools, run `npm install` from the repository root to install all workspace dependencies, including those needed for this package.

## Architecture Overview

The `@owox/connectors` package is a Node.js library that bundles data source connectors and storage implementations. The package automatically discovers all connectors in the `src/Sources/` directory.

### Key Components

- **Core** (`src/Core/`) — Abstract base classes and utilities shared across all connectors (TypeScript/JavaScript)
- **Sources** (`src/Sources/[SOURCE_NAME]/`) — Data source-specific implementations
- **Storages** (`src/Storages/`) — Storage implementations for persisting data
- **Constants** (`src/Constants/`) — Shared constants and enumerations
- **Configs** (`src/Configs/`) — Configuration utilities

### Build System

The build system automatically:

1. Discovers all connectors in `src/Sources/*/`
2. Bundles each connector with its dependencies into isolated modules
3. Generates a single distributable package with all connectors
4. Creates manifests with metadata for each connector

**No manual registration is required** — just create your connector files in the correct location.

## Creating a New Source

For detailed step-by-step instructions on creating a new source, see [Creating a New Source](./CREATING_CONNECTOR.md).

## Architecture Concepts

![Architecture Concepts](./res/architecture-uml.svg)

### Connector

The `Connector` class orchestrates the data transfer process. It requires three components:

1. **Config** — configuration parameters and validation
2. **Source** — data fetching logic
3. **Storage** — data persistence (optional, can be null)

Key responsibilities:

- Validate configuration parameters
- Calculate date ranges for incremental/backfill imports
- Coordinate between Source and Storage
- Handle status updates and logging
- Implement retry logic for the entire import process

All connectors must extend `AbstractConnector` (in `src/Core/AbstractConnector.js`).

### Source

The `Source` class is responsible for fetching data from the external API. It must implement:

- `fetchData(startDate, endDate)` — fetch data for a date range
- `isValidToRetry(error)` — determine if an error is transient (optional)

Helper methods available:

- `urlFetchWithRetry(url, options)` — HTTP fetch with automatic retry
- `calculateBackoff(attemptNumber)` — exponential backoff calculation
- `getFieldsSchema()` — return available fields for the data source

All sources must extend `AbstractSource` (in `src/Core/AbstractSource.js`).

### Storage

The `Storage` class handles data persistence. It must implement:

- `saveData(data)` — persist data to storage
- `areHeadersNeeded()` — check if headers need to be created
- `addHeader(columns)` — create table/sheet headers

All storages must extend `AbstractStorage` (in `src/Core/AbstractStorage.js`).

### Config

Configuration objects handle:

- Parameter definition and validation
- Status tracking (in_progress, done, error)
- Logging and error handling
- State persistence (LastRequestedDate, LastImportDate)

Configuration classes extend `AbstractConfig` (in `src/Core/AbstractConfig.js`).

## Legal

The `@owox/connectors` package is distributed under the MIT License. By submitting a contribution to this package, you affirm that you have the right to do so and that your work will be released under the same MIT License.

To clarify the intellectual property rights granted with each contribution, we also require a signed Contributor License Agreement ("CLA") from every contributor. This protects you as the author, the OWOX team that stewards the project, and the community that depends on these connectors, ensuring everyone can rely on consistent MIT terms within this package.

For more details, review the full [OWOX CLA](https://cla-assistant.io/OWOX/js-data-connectors).

Pull request authors must sign the [OWOX CLA](https://cla-assistant.io/OWOX/js-data-connectors). The signing link appears automatically once you open a PR. If you cannot sign the CLA (for example, due to employment restrictions), **do not submit a PR**. Instead, please open an issue so that someone else can help.

## Questions

Got a question? Feel free to ask the community:

- Check [Issues](https://github.com/OWOX/owox-data-marts/issues)
- Join [Discussions](https://github.com/OWOX/owox-data-marts/discussions)
- Join [Slack Community](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3fffrsau9-UlobJVlXzRLpXmvs0ffvoQ)
