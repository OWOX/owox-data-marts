# Local Deployment

> You can run the OWOX Data Marts application on your own computer with **macOS**, **Windows**, or **Linux**.  
> This option is perfect for a quick start and for testing if everything works for you before moving to more advanced deployment options.

## Option 1. Deployment via npm (recommended for CLI users)

The CLI provides an easy way to launch the pre-built OWOX Data Marts server, including both the frontend and backend components.

1. **Make sure Node.js ≥ 22.16.0 is installed**

   If you don't have it installed, [download it here](https://nodejs.org/en/download)
   (Windows / macOS / Linux installers are all listed there)

   > **Tip:** To avoid potential permission issues (`sudo`), consider using a Node Version Manager like [nvm](https://github.com/nvm-sh/nvm) for macOS/Linux or [nvm-windows](https://github.com/coreybutler/nvm-windows) for Windows.
   > **Note:** If you encounter any installation issues, check the [issue](https://github.com/OWOX/owox-data-marts/issues/274).

2. **Open your terminal** and run **one** command

   ```bash
   npm install -g owox
   ```

   (You'll see a list of added packages. You may see some warnings — just ignore them.)

3. **Start OWOX Data Marts** locally

   ```bash
   owox serve
   ```

   (Expected output:
   🚀 Starting OWOX Data Marts...
   📦 Starting server on port 3000...)

4. **Open** your browser at **<http://localhost:3000>** and explore! 🎉

## Option 2. Deployment via container image (recommended for Docker Desktop users)

1. Make sure **Docker Desktop is installed** and launched

   ```bash
   docker --version
   ```

   (Expected output: Docker version 27.0.3, build abc123)

   > **Tip:** You can [download Docker Desktop here](https://www.docker.com/products/docker-desktop/) or just ask your favorite AI tool to handle the installation on your computer 🤖

2. Pull and run the OWOX Data Marts **container image** with a persistent storage directory. Run **one** command in your terminal

   ```bash
   mkdir -p ~/owox-data
   docker run \
   --name owox-data-marts \
   -p 127.0.0.1:3000:3000 \
   -v "$HOME/owox-data:/root/.local/share/owox/sqlite" \
   -e PORT=3000 \
   -e TRUSTED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" \
   ghcr.io/owox/owox-data-marts:latest
   ```

   (You'll see a list of added packages. You may see some warnings — just ignore them.)

3. **Open** your browser at **<http://localhost:3000>** and explore! 🎉

   > **Tip:** To update your deployment to the latest version, run this command in your terminal

   ```bash
   docker rm -f owox-data-marts && \
   docker pull ghcr.io/owox/owox-data-marts:latest && \
   docker run \
   --name owox-data-marts \
   -p 127.0.0.1:3000:3000 \
   -v "$HOME/owox-data:/root/.local/share/owox/sqlite" \
   -e PORT=3000 \
   -e TRUSTED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" \
   ghcr.io/owox/owox-data-marts:latest
   ```

---

👉 Ready to contribute or run in development mode?
Check out [contributing docs](../../apps/owox/CONTRIBUTING.md) for advanced setup and CLI commands.
