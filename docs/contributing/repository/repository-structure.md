# Repository Structure

This document describes the structure of the OWOX Data Marts monorepo, which is organized to separate deployable applications from shared packages.

The monorepo is divided into two main sections:

- `apps/` - Contains deployable applications and runtimes
- `packages/` - Contains shared libraries and configurations

## Directory Structure

```text
owox-data-marts/
├── apps/                  # Deployable applications
│   ├── web/               # Frontend web application
│   │   ├── src/           # Source code
│   │   └── dist/          # Build artifacts
│   │
│   ├── backend/           # Backend API and platform runtime
│   │   └── src/           # Source code
│   │
│   ├── docs/              # Documentation website
│   │   ├── src/           # Source code
│   │   └── dist/          # Build artifacts
│   │
│   └── owox/              # Command-line interface tool
│       ├── src/           # Source code
│       └── dist/          # Build artifacts
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
├── tools/                 # Additional scripts for project
├── docs/                  # Project documentation
├── dist/                  # Build artifacts
└── temp/                  # Temporary files
```

## Applications (`apps/`)

### Web Application (`apps/web/`)

- React-based frontend application
- Serves the main user interface
- Consumes shared UI components from `packages/ui`
- Build artifacts are served by the backend
- [README](../../../apps/web/README.md)

### Backend (`apps/backend/`)

- NestJS-based backend API
- Serves the web application's build artifacts
- Implements platform runtime
- Uses shared packages for data connectors execution
- [README](../../../apps/backend/README.md)

### OWOX CLI Tool (`apps/owox/`)

- Command-line interface for platform management
- Published as global npm package (`owox`)
- Reuses backend logic and connectors
- Designed for global installation: `npm i -g owox`
- [README](../../../apps/owox/CONTRIBUTING.md)

### Documentation Website (`apps/docs/`)

- Astro-based documentation website
- Contains project documentation and guides
- Built and deployed as static site
- [README](../../../apps/docs/README.md)

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
- [README](../../../packages/connector-runner/README.md)

### ESLint Config (`packages/eslint-config/`)

- Shared ESLint configuration for the workspace
- Provides consistent code style guidelines across all projects
- [README](../../../packages/eslint-config/README.md)

### Prettier Config (`packages/prettier-config/`)

- Shared Prettier configuration for the OWOX Data Marts workspace
- Provides different configurations for various project types:
  - **base**: Core formatting rules for all projects
  - **typescript**: TypeScript-specific rules and file type handling
  - **web**: React/TailwindCSS-specific rules with class sorting
- Features consistent formatting across the monorepo, TypeScript support, TailwindCSS class sorting for web projects, and Markdown/JSON formatting
- [README](../../../packages/prettier-config/README.md)

### TypeScript Config (`packages/typescript-config/`)

- Shared TypeScript configuration for the workspace
- Provides consistent TypeScript settings across all projects
- [README](../../../packages/typescript-config/README.md)

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
