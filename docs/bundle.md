# CLI Bundling Tools: `@vercel/ncc` and `shx`

This document describes the key tools used in the `package:cli` script for bundling the final `owox` CLI package. These tools solve a fundamental problem: transforming applications from a monorepo into a single, self-contained product, ready for distribution.

## @vercel/ncc

### What is it?

`@vercel/ncc` (Node.js Compiler Collection) is a bundling tool that takes your Node.js project's entry point and compiles it, along with all its dependencies from `node_modules`, into a single `.js` file.

### Why is it needed in the project?

`ncc` is a central element of our **"Bundling"** architectural strategy. It performs a key function:

1.  **Creating a self-contained artifact**: `ncc` takes our `backend` application (`apps/backend`) and transforms it into a single `index.js` file. This file does not require an external `node_modules` folder to run, as all necessary code is already contained within it.

2.  **Isolation from "dependency hell"**: The end-user, who installs our CLI (`npm install -g owox`), does not need to download dozens or hundreds of dependencies that the backend relies on. This makes the installation process significantly faster and much more reliable, as it eliminates package version conflicts on the user's machine.

3.  **Simplicity of deployment and execution**: A single file is extremely easy to run. Our `owox serve` command simply executes `node path/to/bundle.js`. This also greatly simplifies the subsequent packaging of the application into a minimalist Docker container for Enterprise clients, as only this one file needs to be copied into the container.

## shx

### What is it?

`shx` is a portable, cross-platform implementation of common Unix shell commands (such as `cp`, `rm`, `mkdir`).

### Why is it needed in the project?

1.  **Cross-platform compatibility**: Scripts defined in `package.json` must work identically for all developers, regardless of whether they use macOS, Linux, or Windows. Standard commands like `rm -rf` are not present in the Windows command line by default. `shx` solves this problem by providing a single syntax for all systems.

2.  **Simplification of build scripts**: Thanks to `shx`, we can write simple and clear file manipulation commands directly in `package.json`, without creating complex and separate `.sh` (for Unix) and `.bat` (for Windows) files.

3.  **Specific usage in our project**:
    - `shx rm -rf apps/owox/dist`: Used in the `prepackage:cli` script for reliably cleaning the build directory before creating a new one.
    - `shx cp -r apps/web/dist apps/owox/dist/public`: Copies the built frontend application into our CLI's final `dist` directory, from where it will be served by the backend.
