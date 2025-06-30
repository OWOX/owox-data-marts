# OWOX Docs

This is the source code for the monorepo documentation site based on the [Astro + Starlight](https://starlight.astro.build/) project.

## 🗂️ Project Structure

Inside the OWOX Docs project (`apps/docs` from the monorepo root), you'll find the following folders and files:

```bash
.
├── public/
├── scripts/
│   ├── env-config.js        # Environment configuration script
│   ├── sync-docs.js         # Content and assets synchronization script
│   └── utils.js             # Utils functions script
├── src/
│   └── content.config.ts     # Starlight content configuration
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## ⚙️ How it works

Unlike a standard Starlight project, all documentation content is dynamically synced from the entire monorepo. The content is copied to the `src/content/docs/` directory, and images are copied to `src/assets/` during the development and build processes. You can also manually trigger the content update process by running the sync command.

The Starlight framework then looks for `.md` or `.mdx` files in the content directory. Each file is exposed as a route based on its file name.

Images are located in `src/assets/` and can be embedded in Markdown using a relative link.

Static assets, such as favicons, can be placed in the `public/` directory. These are not dynamically synced.

## 📜 Scripts

The `scripts/` directory contains scripts for synchronizing documentation content and configuring the environment.

> ℹ️ For information about required environment variables for production, see [⚠️ Environment Variables](#️-environment-variables).

## 🧞 Commands

You can run commands from different directories in the monorepo.

### 🏠 Commands from the monorepo root

These commands are run from the **monorepo root** in a terminal:

| Command              | Action                                             |
| :------------------- | :------------------------------------------------- |
| `npm install`        | Installs all monorepo dependencies                 |
| `npm run dev:docs`   | Starts the local dev server at `localhost:4321`    |
| `npm run build:docs` | Builds your production site to `./apps/docs/dist/` |

### 📁 Commands from the project root (`/apps/docs`)

These commands are run from the **project root** in a terminal:

| Command                   | Action                                              |
| :------------------------ | :-------------------------------------------------- |
| `npm install`             | Installs project dependencies                       |
| `npm run sync`            | Copies content (`.md` files) and images to `./src/` |
| `npm run dev`             | Starts the local dev server at `localhost:4321`     |
| `npm run build`           | Builds your production site to `./dist/`            |
| `npm run preview`         | Previews your build locally before deploying        |
| `npm run astro ...`       | Runs CLI commands like `astro add`, `astro check`   |
| `npm run astro -- --help` | Gets help using the Astro CLI                       |

## ⚠️ Environment Variables

Before deploying to production, make sure to set all required environment variables.  
These variables are processed by the `env-config.mjs` script.
