# owox

A new CLI generated with oclif

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
$ owox COMMAND
running command...
$ owox (--version)
owox/0.0.0 darwin-arm64 node-v20.12.2
$ owox --help [COMMAND]
USAGE
  $ owox COMMAND
...
```

<!-- usagestop -->

# Local Development: npm link

For local development and testing of this CLI, especially when it's not published to a public npm registry, you can use `npm link`. This command creates a symbolic link from your local package to the global npm directory, allowing you to run `owox` from any directory on your system as if it were globally installed.

## Using `npm link`

To link your local `owox` CLI globally, navigate to the `apps/cli` directory and execute:

```sh-session
$ npm link
```

After successfully linking, you can run `owox` commands from any directory:

```sh-session
$ owox hello World --from OWOX
```

## Using `npm unlink -g owox`

If you need to remove the global symbolic link to your local `owox` CLI, navigate to the `apps/cli` directory and execute:

```sh-session
$ npm unlink -g owox
```

This will remove the global link, and `owox` will no longer be accessible globally unless re-linked or installed through an npm registry.

# Commands

<!-- commands -->

- [`owox hello PERSON`](#owox-hello-person)
- [`owox hello world`](#owox-hello-world)
- [`owox help [COMMAND]`](#owox-help-command)
- [`owox plugins`](#owox-plugins)
- [`owox plugins add PLUGIN`](#owox-plugins-add-plugin)
- [`owox plugins:inspect PLUGIN...`](#owox-pluginsinspect-plugin)
- [`owox plugins install PLUGIN`](#owox-plugins-install-plugin)
- [`owox plugins link PATH`](#owox-plugins-link-path)
- [`owox plugins remove [PLUGIN]`](#owox-plugins-remove-plugin)
- [`owox plugins reset`](#owox-plugins-reset)
- [`owox plugins uninstall [PLUGIN]`](#owox-plugins-uninstall-plugin)
- [`owox plugins unlink [PLUGIN]`](#owox-plugins-unlink-plugin)
- [`owox plugins update`](#owox-plugins-update)

## `owox hello PERSON`

Say hello

```
USAGE
  $ owox hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ owox hello friend --from owox
  hello friend from owox! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/mdonnalley/owox/blob/v0.0.0/src/commands/hello/index.ts)_

## `owox hello world`

Say hello world

```
USAGE
  $ owox hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ owox hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/mdonnalley/owox/blob/v0.0.0/src/commands/hello/world.ts)_

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

## `owox plugins`

Plugins are a powerful way to extend your CLI functionality without modifying its core code. Think of them as "apps for your CLI" - they can add new commands, features, or modify existing behavior. With plugins, other developers can create and share reusable functionality that you can easily install into your CLI. For example, you can add database management commands, cloud service integrations, or custom development tools through plugins.

```
USAGE
  $ owox plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ owox plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/index.ts)_

## `owox plugins add PLUGIN`

Installs a plugin into owox.

```
USAGE
  $ owox plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into owox.

  Uses bundled npm executable to install plugins into /Users/mdonnalley/.local/share/owox

  Installation of a user-installed plugin will override a core plugin.

  Use the OWOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the OWOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ owox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ owox plugins add myplugin

  Install a plugin from a github url.

    $ owox plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ owox plugins add someuser/someplugin
```

## `owox plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ owox plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ owox plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/inspect.ts)_

## `owox plugins install PLUGIN`

Installs a plugin into owox.

```
USAGE
  $ owox plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into owox.

  Uses bundled npm executable to install plugins into /Users/mdonnalley/.local/share/owox

  Installation of a user-installed plugin will override a core plugin.

  Use the OWOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the OWOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ owox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ owox plugins install myplugin

  Install a plugin from a github url.

    $ owox plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ owox plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/install.ts)_

## `owox plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ owox plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ owox plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/link.ts)_

## `owox plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ owox plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ owox plugins unlink
  $ owox plugins remove

EXAMPLES
  $ owox plugins remove myplugin
```

## `owox plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ owox plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/reset.ts)_

## `owox plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ owox plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ owox plugins unlink
  $ owox plugins remove

EXAMPLES
  $ owox plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/uninstall.ts)_

## `owox plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ owox plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ owox plugins unlink
  $ owox plugins remove

EXAMPLES
  $ owox plugins unlink myplugin
```

## `owox plugins update`

Update installed plugins.

```
USAGE
  $ owox plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/main/src/commands/plugins/update.ts)_

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
