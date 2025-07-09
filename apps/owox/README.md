# Quick Start 🚀 (no-code setup)

A command-line interface for running OWOX Data Marts application. This CLI provides a simple way to start the pre-built OWOX Data Marts server with frontend and backend components.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/owox.svg)](https://npmjs.org/package/owox)
[![Downloads/week](https://img.shields.io/npm/dw/owox.svg)](https://npmjs.org/package/owox)

1. **Make sure Node.js ≥ 22.16.0 is installed**

   If you don't have it installed, [download it here](https://nodejs.org/en/download)
   (Windows / macOS / Linux installers are all listed there)

   > **Tip:** To avoid potential permission issues (`sudo`), consider using a Node Version Manager like [nvm](https://github.com/nvm-sh/nvm) for macOS/Linux or [nvm-windows](https://github.com/coreybutler/nvm-windows) for Windows.
   > **Note**: If you encounter any installation issues, check the [іssue](https://github.com/OWOX/owox-data-marts/issues/274).

2. **Open your terminal** and run **one** command

   ```bash
   npm install -g owox
   ```

   (You'll see a list of added packages. Some warns are possible — just ignore them.)

3. **Start OWOX Data Marts** locally

   ```bash
   owox serve
   ```

   (Expected output:
   🚀 Starting OWOX Data Marts...
   📦 Starting server on port 3000...)

4. **Open** your browser at **<http://localhost:3000>** and explore! 🎉

---

👉 Ready to contribute or run in development mode?
Check out [CONTRIBUTING.md](./CONTRIBUTING.md) for advanced setup and CLI commands.
