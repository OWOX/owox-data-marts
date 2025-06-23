# OWOX Data Marts CLI

A command-line interface for running OWOX Data Marts application. This CLI provides a simple way to start the pre-built OWOX Data Marts server with frontend and backend components bundled together.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/owox.svg)](https://npmjs.org/package/owox)
[![Downloads/week](https://img.shields.io/npm/dw/owox.svg)](https://npmjs.org/package/owox)

<!-- toc -->

- [Usage](#usage)
- [Local Development: npm link](#local-development-npm-link)
- [Commands](#commands)
- [FAQ: Understanding the `bin` Folder](#faq-understanding-the-bin-folder)
<!-- tocstop -->

# Usage

<!-- usage -->

```sh-session
$ npm install -g owox
$ owox serve
Starting OWOX Data Marts...
Starting in production mode...
Starting server on port 3000...
$ owox --help
USAGE
  $ owox COMMAND
...
```

<!-- usagestop -->

# Local Development: npm link

For local development and testing of this CLI, especially when it's not published to a public npm registry, you can use `npm link`. This command creates a symbolic link from your local package to the global npm directory, allowing you to run `owox` from any directory on your system as if it were globally installed.

## Using `npm link`

To link your local `owox` CLI globally, navigate to the `apps/owox` directory and execute:

```sh-session
$ npm link
```

After successfully linking, you can run `owox` commands from any directory:

```sh-session
$ owox serve --port 8080
```

## Using `npm unlink -g owox`

If you need to remove the global symbolic link to your local `owox` CLI, navigate to the `apps/owox` directory and execute:

```sh-session
$ npm unlink -g owox
```

This will remove the global link, and `owox` will no longer be accessible globally unless re-linked or installed through an npm registry.

# Commands

<!-- commands -->

- [`owox serve`](#owox-serve)
- [`owox help [COMMAND]`](#owox-help-command)

## `owox serve`

Start the OWOX Data Marts application in production mode

```
USAGE
  $ owox serve [-p <value>]

FLAGS
  -p, --port=<value>  [default: 3000] Port number for the application

DESCRIPTION
  Start the OWOX Data Marts application in production mode

EXAMPLES
  $ owox serve
  $ owox serve --port 8080
  $ owox serve -p 3001
```

_See code: [src/commands/serve.ts](https://github.com/OWOX/owox-data-marts/blob/v0.0.0/src/commands/serve.ts)_

## `owox help [COMMAND]`

Display help for owox.

```
USAGE
  $ owox help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for owox.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.0.21/src/commands/help.ts)_

<!-- commandsstop -->

# FAQ

This section explains the purpose of the files located in the `bin` directory of the CLI.

### Why are there files in the `bin` folder (`dev.cmd`, `run.js`, `dev.js`, `run.cmd`)? Why do some have a `.cmd` format?

The `bin` folder contains the executable entry points for your CLI. Their presence and format are designed to support different operating systems and operational modes (development/production).

- **`run.js` (and `run.cmd`)**: These are the primary "production" entry points for your CLI.

  - **`run.js`**: This is the main executable file for Unix-based systems (Linux, macOS). The `#!/usr/bin/env node` (shebang) line at the beginning tells the operating system to execute this file using Node.js. This file launches the compiled version of your CLI (from the `dist` folder).
  - **`run.cmd`**: This is the equivalent of `run.js` for Windows operating systems. Windows does not understand shebangs, so a separate `.cmd` (or `.bat`) file is required to explicitly instruct the system to execute the Node.js script using the `node` interpreter.

- **`dev.js` (and `dev.cmd`)**: These are entry points specifically designed for **development**.
  - **`dev.js`**: This executable file is for Unix-based systems when running in development mode. Notice the shebang line `#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning`. This allows Node.js to run your TypeScript code **without prior compilation** by using the `ts-node/esm` loader. This significantly speeds up development as you don't need to wait for compilation every time you make changes. The `development: true` flag is passed to `@oclif/core` to enable development-specific features.
  - **`dev.cmd`**: This is the Windows equivalent of `dev.js`, also used for running in development mode with `ts-node/esm`.

In summary, the `.cmd` files ensure compatibility with Windows, while the `run` and `dev` pairs provide distinct entry points for the "production-ready" (compiled) CLI version and the active development version (directly from TypeScript source files).
