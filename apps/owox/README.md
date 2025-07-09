# Quick Start 🚀 (no-code setup)

A command-line interface for running OWOX Data Marts application. This CLI provides a simple way to start the pre-built OWOX Data Marts server with frontend and backend components.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/owox.svg)](https://npmjs.org/package/owox)
[![Downloads/week](https://img.shields.io/npm/dw/owox.svg)](https://npmjs.org/package/owox)

1. **Make sure Node.js ≥ 22.16.0 is installed**

   If you don't have it installed, [download it here](https://nodejs.org/en/download)
   (Windows / macOS / Linux installers are all listed there)

   > **Note**: If you encounter any installation issues, check the [Issues](#issues) section at the bottom of this document.

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

## Issues

### Installing packages always requires administrator privileges on MacOS/Linux

If you encounter permission issues when installing Node.js or npm packages, follow these steps for a proper installation.

```bash
npm error code EACCES
npm error syscall mkdir
npm error path /Users/USER/.npm/_cacache/index-v5/6b/bb
npm error errno EACCES
npm error
npm error Your cache folder contains root-owned files, due to a bug in
npm error previous versions of npm which has since been addressed.
npm error
npm error To permanently fix this problem, please run:
npm error   sudo chown -R 501:20 "/Users/USER/.npm"
npm error A complete log of this run can be found in: /Users/USER/.npm/_logs/2025-07-04T13_57_53_164Z-debug-0.log
```

#### Recommended Solution

##### 1. Install Command Line Tools (if not installed)

```bash
xcode-select --install
```

##### 2. Install Node Version Manager (nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

##### 3. Verify nvm installation

```bash
nvm --version
```

##### 4. Install and configure Node.js

```bash
# Install latest LTS version (recommended)
nvm install --lts

# Or install latest version
nvm install node

# Verify installation
node -v
```

##### 5. Install and run OWOX Data Marts

```bash
# Install globally
npm install -g owox

# Start the application
owox serve
```

#### Benefits of using nvm

- Easy switching between Node.js versions
- No sudo required for package installation
- User-level installation instead of system-wide
- Only Command Line Tools required, full Xcode is not needed
