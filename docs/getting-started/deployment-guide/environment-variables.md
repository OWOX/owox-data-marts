# Environment Variables

This document describes how to configure environment variables for working with OWOX Data Marts. The system automatically loads configuration when starting the application with the `serve` command.

## Table of Contents

- [Core Principles](#core-principles)
- [Configuration Methods](#configuration-methods)
- [Environment Loading Priority](#environment-loading-priority)
- [Troubleshooting](#troubleshooting)

## Core Principles

OWOX Data Marts can receive environment variables in two ways:

- **From system environment** - variables set directly in the runtime environment
- **From configuration file** - variables loaded from a `.env` file

Depending on the selected database type for the backend (`DB_TYPE`) and identity provider (`IDP_PROVIDER`), you need to set the corresponding additional environment variables:

- **For `DB_TYPE=mysql`** - add MySQL connection variables (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`)
- **For `IDP_PROVIDER=better-auth`** - add Better Auth variables (`IDP_BETTER_AUTH_SECRET`, `IDP_BETTER_AUTH_BASE_URL`, etc.)

The complete list of all available environment variables is located in the `.env.example` file in the project root directory.

## Configuration Methods

You can configure environment variables using one of the following methods:

### Option A: Through Configuration File

By default, the `owox serve` command looks for a `.env` file in the current directory (where you run the command).

#### Creating Configuration File

Create and edit the `.env` file and set the values required for your configuration:

```bash
# Common variables
PORT=3030
LOG_FORMAT=pretty

# Database
DB_TYPE=sqlite
SQLITE_DB_PATH=./database/backend.db

# Identity provider
IDP_PROVIDER=none
```

#### Running the Application

Various ways to specify the path to the file:

```bash
# 1. If .env is in the current directory
owox serve

# 2. If .env is in another location - via flag
owox serve --env-file /path/to/.env
owox serve -e /path/to/.env
```

### Option B: Through Docker/Containers

When using containers, environment variables are passed from outside the container inside through the corresponding platform mechanisms (Docker, Kubernetes, etc.).

> **🐳 Containers**: Environment variables are set outside the container and passed inside during startup. Inside the container, the application sees them as regular environment variables.

### Option C: Through Hosting Platform

Most hosting platforms provide their own interface for setting environment variables. Usually it's an "Environment Variables" or "Config Vars" section in project settings.

### Option D: Through Command Line Arguments

Some environment variables can be configured directly through command line arguments. This option provides the highest priority for configuration:

```bash
# Using command line arguments (highest priority)
owox serve --port 3030 --log-format json

# Combined with environment file
owox serve --env-file .env.production --port 3030
```

> **⚠️ Limited scope**: Only a limited set of variables can be configured through command line arguments. Currently supported: `PORT` (via `--port`) and `LOG_FORMAT` (via `--log-format`). For other variables, use environment files or system environment variables.

### Option E: Through Command Line Variables

Set variables directly before running the command:

```bash
# Linux/macOS/Windows (Git Bash)
DB_TYPE=sqlite SQLITE_DB_PATH=./database/backend.db IDP_PROVIDER=none owox serve

# Windows (Command Prompt)
set DB_TYPE=sqlite && set SQLITE_DB_PATH=./database/backend.db && set IDP_PROVIDER=none && owox serve

# Windows (PowerShell)
$env:DB_TYPE="sqlite"; $env:SQLITE_DB_PATH="./database/backend.db"; $env:IDP_PROVIDER="none"; owox serve
```

## Environment Loading Priority

This section describes the internal logic of the environment variable loading system. Understanding this order will help you configure the correct setup and diagnose problems.

The system loads environment variables in the following priority order (highest to lowest):

### 1. Command Line Arguments (Highest Priority)

Variables specified through command line arguments override all other sources:

```bash
owox serve --port 3030 --log-format json
```

> **⚠️ Note**: Only `--port` and `--log-format` are currently supported as command line arguments.

### 2. System Environment Variables

Variables set directly in the runtime environment (system environment variables or variables set through hosting platform interfaces).

### 3. Explicitly Specified Environment File

When you specify a path to a configuration file via `--env-file`:

```bash
owox serve --env-file /path/to/.env.production
```

### 4. Default .env File

If no environment file is explicitly specified, the system looks for a `.env` file in the current directory:

```bash
owox serve
```

### 5. Default Values (Lowest Priority)

If variables are not set through any of the above methods, the system uses default values:

```text
PORT=3000
LOG_FORMAT=pretty
```

### Priority Example

**Example demonstrating priority:**

```bash
# All these sources can provide PORT value:
# 1. Command line argument (highest priority): --port 3030
# 2. System environment: export PORT=3010
# 3. Explicitly specified file: PORT=3020 in custom.env
# 4. Default .env file: PORT=3000
# 5. Default value: PORT=3000 (lowest priority)

owox serve --env-file custom.env --port 3030
# Result: PORT=3030 (from command line argument)
```

## Troubleshooting

### Checking Variable Loading

The system outputs detailed messages about the loading process:

```bash
owox serve --env-file .env.production
```

Expected messages:

- `✅ Environment variables successfully loaded from specified file: /absolute/path/.env.production`
- `⚠️ No valid environment file found`

### Common Errors

#### File Not Found

```text
📁 File not found: /path/to/.env
```

**Solution**: Check the correctness of the file path.

#### Parsing Error

```text
❌ Failed to parse environment file /path/to/.env with error: [error details]
```

**Solution**: Check the syntax of the `.env` file.

#### Variables Not Loading

```text
⚠️ No valid environment file found
```

**Solution**:

1. Create a `.env` file in the root directory
2. Specify the correct path via `--env-file`
3. Set variables directly in the environment (without using a file):
   - Via command line: `PORT=3030 DB_TYPE=sqlite owox serve`
   - Via hosting platform environment variables interface
   - Via system environment variables
