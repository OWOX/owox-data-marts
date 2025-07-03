# OWOX Web Application
## Overview
This is the web interface for OWOX Data Marts - an open-source solution for Data Analysts. This web application provides a user-friendly interface for managing Data Marts. This is the web interface for OWOX Data Marts - an open-source solution for Data Analysts. This web application provides a user-friendly interface for managing Data Marts.This is the web interface for OWOX Data Marts - an open-source solution for Data Analysts. This web application provides a user-friendly interface for managing Data Marts.This is the web interface for OWOX Data Marts - an open-source solution for Data Analysts. This web application provides a user-friendly interface for managing Data Marts.This is the web interface for OWOX Data Marts - an open-source solution for Data Analysts. This web application provides a user-friendly interface for managing Data Marts.
## Technologies Used
* **React**: v19.1.0 - UI library for building the user interface
* **TypeScript**: v5.7.3 - For type-safe JavaScript development
* **Tailwind CSS**: v4.1.8 - For utility-first styling
- **Vite**: v6.3.5 - For fast development and optimized builds
- **Node.js packages**: Various dependencies for UI components and development tools
## Project Structure

The project follows a monorepo structure using npm workspaces.

## Getting Started

### Prerequisites

- Node.js (latest LTS version recommended)
- npm (comes with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/OWOX/owox-data-marts.git
   cd owox-data-marts
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

To start the development server:

```bash
# From the root directory to run all workspaces:
npm run dev

# Or to run just the web app:
cd apps/web
npm run dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is already in use).

### Building for Production

To create a production build:

```bash
# From the root directory:
cd apps/web
npm run build
```

The built files will be in the `apps/web/dist` directory.

To preview the production build:

```bash
npm run preview
```

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with automatic fixes
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run preview` - Preview the production build

## Related Documentation

- For information about the overall project, see the [main README](../../README.md)
- For UI components documentation, check the [UI package](../../packages/ui)

## Contributing

Contributions are welcome! Please see the [Contributor guide](../../packages/connectors/CONTRIBUTING.md) for details on how to contribute to the project.