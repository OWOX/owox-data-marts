# OWOX Docs

This is source code for monorepo documentation site based on [Astro + Starlight][https://starlight.astro.build/] project.

## 🚀 Project Structure

Inside of OWOX Docs project (`apps/docs` from monorepo root), you'll see the following folders and files:

```
.
├── public/
├── scripts/
│   ├── env-config.mjs
│   └── sync-docs.mjs
├── src/
│   └── content.config.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## 🚀 How it works

As you see in project structure there is difference between standart Starlight projects. All content is dynamical synced from all monorepo, and copied to the content (`src/content/docs/`) and assets (`src/assets/`) directories with dev and build commands. Also, you can manually initiate content updating process by sync command.

Then Starlight framework looks for `.md` or `.mdx` files in the content directory. Each file is exposed as a route based on its file name.

Images are founded in `src/assets/` and embedded in Markdown with a relative link.

Static assets, like favicons, can be placed in the `public/` directory. They are not dynamically synced.

## 🧞 Commands

You can run commands from the different directories of monorepo.

### Commands from the monopero root

This commands are run from the **monorepo root**, from a terminal:

| Command              | Action                                            |
| :------------------- | :------------------------------------------------ |
| `npm install`        | Installs all monorepo dependencies                |
| `npm run dev:docs`   | Starts local dev server at `localhost:4321`       |
| `npm run build:docs` | Build your production site to `./apps/docs/dist/` |

### Commands from the project root (/apps/docs)

This commands are run from the **project root**, from a terminal:

| Command                   | Action                                                |
| :------------------------ | :---------------------------------------------------- |
| `npm install`             | Installs project dependencies                         |
| `npm run sync`            | Copy content (`.md files`) and images to the `./src/` |
| `npm run dev`             | Starts local dev server at `localhost:4321`           |
| `npm run build`           | Build your production site to `./dist/`               |
| `npm run preview`         | Preview your build locally, before deploying          |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check`      |
| `npm run astro -- --help` | Get help using the Astro CLI                          |
