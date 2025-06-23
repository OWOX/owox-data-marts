# OWOX Data Marts Monorepo Structure

This document describes the structure of the OWOX Data Marts monorepo, which is organized to separate deployable applications from shared packages.

## Overview

The monorepo is divided into two main sections:

- `apps/` - Contains deployable applications and runtimes
- `packages/` - Contains shared libraries and configurations

## Directory Structure

```
owox-data-marts/
├── apps/                  # Deployable applications
│   ├── web/               # Frontend web application
│   │   ├── src/           # Source code
│   │   └── dist/          # Build artifacts
│   │
│   ├── backend/           # Backend API and platform runtime
│   │   └── src/           # Source code
│   │
│   └── cli/               # Command-line interface tool
│       └── src/           # Source code
│
├── packages/              # Shared libraries and configurations
│   ├── ui/                # Shared UI components and design system
│   │   └── src/           # Source code
│   │
│   ├── connectors/        # Data connectors and API integrations
│   │   └── src/           # Source code
│   │
│   ├── connector-runner/  # Core connector execution logic
│   │   └── src/           # Source code
│   │
│   ├── eslint-config/     # Shared ESLint configurations
│   │
│   ├── prettier-config/   # Shared Prettier configurations
│   │
│   └── typescript-config/ # Shared TypeScript configurations
│
├── tools/                 # Additinal scripts for project
└── docs/                  # Project documentation
```

## Applications (`apps/`)

### Web Application (`apps/web/`)

- React-based frontend application
- Serves the main user interface
- Consumes shared UI components from `packages/ui`
- Build artifacts are served by the backend

### Backend (`apps/backend/`)

- NestJS-based backend API
- Serves the web application's build artifacts
- Implements platform runtime
- Uses shared packages for data connectors execution

### CLI Tool (`apps/cli/`)

- Command-line interface for platform management
- Published as global npm package (`owox`)
- Reuses backend logic and connectors
- Designed for global installation: `npm i -g owox`

## Shared Packages (`packages/`)

### UI Package (`packages/ui/`)

- Shared React components
- Implements shadcn/ui-based design system
- Tailwind CSS styling
- Used by the web application and other frontends outside of this monorepo

### Connectors (`packages/connectors/`)

- Data Source integrations
- Shared across backend and CLI

### Connector runner (`packages/connector-runner/`)

- Core logic for connector execution
- Used by backend and CLI

## Development Workflow

1. Each app and package has its own `package.json`
2. Dependencies between packages are managed using workspace references
3. Shared configurations (linting, TypeScript) are maintained in respective packages
4. Build artifacts are generated in respective `dist/` directories

## Package Management

- Root `package.json` defines workspaces for both `apps/*` and `packages/*`
- Each package can be developed and tested independently
- Dependencies between packages use `workspace:*` syntax
- Shared packages are not published to npm but used internally

## Best Practices

1. Keep shared code in appropriate packages
2. Maintain clear boundaries between apps and packages
3. Use TypeScript for type safety across the monorepo
4. Follow consistent coding standards using shared linter config
5. Document public APIs and interfaces
