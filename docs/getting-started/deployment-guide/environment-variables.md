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

Since the application consists of multiple components, each of them may attempt to load environment variables independently. To coordinate this process, a special variable `OWOX_ENV_SET=true` is used, which signals to all components that environment variables are already set and reloading is not needed.

Depending on the selected database type for the backend (`DB_TYPE`) and identity provider (`IDP_PROVIDER`), you need to set the corresponding additional environment variables:

- **For `DB_TYPE=mysql`** - add MySQL connection variables (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`)
- **For `IDP_PROVIDER=owox`** - add OWOX IDP configuration variables (`IDP_OWOX_BASE_URL`, `IDP_OWOX_CLIENT_ID`, etc.)
- **For `IDP_PROVIDER=better-auth`** - add Better Auth variables (`IDP_BETTER_AUTH_SECRET`, `IDP_BETTER_AUTH_BASE_URL`, etc.)

The complete list of all available environment variables is located in the `.env.example` file in the project root directory.

## Configuration Methods

You can configure environment variables using one of the following methods:

### Option A: Through Configuration File

By default, the `owox serve` command looks for a `.env` file in the current directory (where you run the command).

#### Creating Configuration File

```bash
# Linux/macOS
touch .env

# Windows (Command Prompt)
echo. > .env

# Windows (PowerShell)
New-Item -ItemType File -Name ".env"

# Or create the file through any text editor
```

#### File Configuration

Edit the `.env` file and set the values required for your configuration:

```bash
# Core OWOX variables
OWOX_ENV_SET=true
LOG_FORMAT=pretty

# Database (SQLite for development)
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

# 3. If .env is in another location - via environment variable
# Linux/macOS/Windows (Git Bash)
OWOX_ENV_FILE_PATH=/path/to/.env owox serve

# Windows (Command Prompt)
set OWOX_ENV_FILE_PATH=/path/to/.env && owox serve

# Windows (PowerShell)
$env:OWOX_ENV_FILE_PATH="/path/to/.env"; owox serve
```

### Option B: Through Docker/Containers

When using containers, environment variables are passed from outside the container inside through the corresponding platform mechanisms (Docker, Kubernetes, etc.).

> **🐳 Containers**: Environment variables are set outside the container and passed inside during startup. Inside the container, the application sees them as regular environment variables.

### Option C: Through Hosting Platform

Most hosting platforms provide an interface for setting environment variables:

- **AWS Lambda**: Environment variables in console
- **Google Cloud Run**: Environment variables in service settings
- **Heroku**: Config Vars in app panel
- **DigitalOcean App Platform**: Environment Variables in configuration
- **Render**: Environment Variables in service settings
- **Railway**: Variables in service settings
- **Vercel**: Environment Variables in project settings
- **Netlify**: Site settings → Environment variables

> **☁️ Hosting**: Each platform has its own interface for managing environment variables. Usually it's an "Environment Variables" or "Config Vars" section in project settings.

### Option D: Through Command Line Variables

Set variables directly before running the command:

```bash
# Linux/macOS/Windows (Git Bash)
OWOX_ENV_SET=true LOG_FORMAT=pretty DB_TYPE=sqlite SQLITE_DB_PATH=./database/backend.db IDP_PROVIDER=none owox serve

# Windows (Command Prompt)
set OWOX_ENV_SET=true && set LOG_FORMAT=pretty && set DB_TYPE=sqlite && set SQLITE_DB_PATH=./database/backend.db && set IDP_PROVIDER=none && owox serve

# Windows (PowerShell)
$env:OWOX_ENV_SET="true"; $env:LOG_FORMAT="pretty"; $env:DB_TYPE="sqlite"; $env:SQLITE_DB_PATH="./database/backend.db"; $env:IDP_PROVIDER="none"; owox serve
```

## Environment Loading Priority

This section describes the internal logic of the environment variable loading system. Understanding this order will help you configure the correct setup and diagnose problems.

The system loads environment variables in the following priority order:

### 1. Previous Loading Check

First, the system checks the `OWOX_ENV_SET` variable. If it's set to `true`, loading is skipped. This is important for individual components that may independently load environment variables, as well as when environment variables are not set through a file.

### 2. Explicitly Specified File

If you passed a path to a configuration file:

```bash
owox serve --env-file /path/to/.env.production
```

### 3. File Through Environment Variable

If the `OWOX_ENV_FILE_PATH` variable is set:

```bash
OWOX_ENV_FILE_PATH=/path/to/.env owox serve
```

> **💡 Priority**: Explicitly specifying a file through the `--env-file` flag has higher priority than the `OWOX_ENV_FILE_PATH` environment variable.

### 4. Default .env File

If none of the previous options worked, the system looks for a `.env` file in the current directory (from which the command was launched):

```bash
owox serve
```

## Troubleshooting

### Checking Variable Loading

The system outputs detailed messages about the loading process:

```bash
owox serve --env-file .env.production
```

Expected messages:

- `✅ Environment variables successfully loaded from specified file: /absolute/path/.env.production`
- `✅ Environment already configured via OWOX_ENV_SET=true`
- `⚠️ No valid environment file found`

### Common Errors

#### File Not Found

```text
📁 File not found: /path/to/.env
```

**Solution**: Check the correctness of the file path

#### Parsing Error

```text
❌ Failed to parse environment file /path/to/.env with error: [error details]
```

**Solution**: Check the syntax of the `.env` file

#### Variables Not Loading

```text
⚠️ No valid environment file found
```

**Solution**:

1. Create a `.env` file in the root directory
2. Specify the correct path via `--env-file`
3. Set the `OWOX_ENV_FILE_PATH` variable
4. Set variables directly in the environment (without using a file):
   - Via command line: `OWOX_ENV_SET=true DB_TYPE=sqlite owox serve`
   - Via hosting platform environment variables interface
   - Via system environment variables
