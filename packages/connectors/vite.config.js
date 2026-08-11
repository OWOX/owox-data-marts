import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { ManifestParser } from './src/Core/Declarative/ManifestParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ConnectorBuilder {
  constructor() {
    this.rootDir = __dirname;
    this.srcDir = path.join(this.rootDir, 'src');
    this.distDir = path.join(this.rootDir, 'dist');
    this.tempDir = path.join(this.rootDir, 'build');
  }

  // Discover all connectors
  async discoverConnectors() {
    const connectorDirs = await glob('src/Sources/*/', {
      cwd: this.rootDir,
      ignore: ['**/Templates/**'],
    });

    const connectors = [];

    for (const dir of connectorDirs) {
      const name = path.basename(dir);
      const connectorPath = path.join(this.rootDir, dir);
      // Source.js is the discovery anchor for JS connectors.
      // Connector.js is being phased out (was the legacy entry point), so we
      // anchor on Source.js to keep discovery working before, during, and
      // after the migration. Connector.js, if present, is still bundled by
      // buildConnectorModules() because it uses the glob'd file list.
      const sourceFile = path.join(connectorPath, 'Source.js');
      const manifestPath = path.join(connectorPath, 'manifest.json');
      const hasSource = await fs.pathExists(sourceFile);
      const hasManifest = await fs.pathExists(manifestPath);

      let manifest = null;
      let manifestRaw = null;
      if (hasManifest) {
        manifestRaw = await fs.readFile(manifestPath, 'utf8');
        try {
          manifest = JSON.parse(manifestRaw);
        } catch (e) {
          // Name the connector. A bare SyntaxError from JSON.parse says only
          // "Unexpected token" with no hint which of ~16 manifests it came from.
          throw new Error(`Connector "${name}": manifest.json is not valid JSON — ${e.message}`);
        }

        // Convert logo to base64 if it exists
        if (manifest.logo) {
          const logoPath = path.join(connectorPath, manifest.logo);
          if (await fs.pathExists(logoPath)) {
            const logoBuffer = await fs.readFile(logoPath);
            const logoExt = path.extname(manifest.logo).toLowerCase();
            const mimeType =
              logoExt === '.png'
                ? 'image/png'
                : logoExt === '.jpg' || logoExt === '.jpeg'
                  ? 'image/jpeg'
                  : logoExt === '.svg'
                    ? 'image/svg+xml'
                    : 'image/png';
            manifest.logo = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
          }
        }
      }

      // A connector is declarative when it has a manifest with `nodes` and no Source.js.
      const isDeclarative = !hasSource && !!(manifest && manifest.nodes);

      // A directory under src/Sources/ that is neither a JS nor a declarative connector is a
      // mistake, not a valid state -- so fail the build instead of dropping it. Skipping it
      // silently is worse than it sounds: the connector simply vanishes from the bundle, and
      // the only thing that notices is a backend e2e length assertion in another package,
      // which reports "expected 16, got 15" without naming what went missing.
      if (!hasSource && !isDeclarative) {
        throw new Error(
          `Connector "${name}": not a connector. A JS connector needs Source.js; a declarative ` +
            `one needs a manifest.json with a "nodes" key (found ` +
            `${hasManifest ? 'a manifest.json without "nodes"' : 'no manifest.json'}). ` +
            `Remove the directory if it is not a connector.`
        );
      }

      // Validate a bundled declarative manifest against the same parser that runs it. Without
      // this the build only JSON.parse()s the file, so a manifest that is valid JSON but invalid
      // grammar ships green and fails at runtime -- meaning our own bundled connectors would get
      // LESS validation than user-authored ones, which the backend parses on publish.
      //
      // This narrows the gap, it does not close it: the parser rejects missing/misnamed required
      // keys, malformed auth, a recordPath that is not an array, and a pagination or incremental
      // block that could not work at run time — but still accepts some shape errors (e.g. a
      // request path missing its leading "/").
      if (isDeclarative) {
        try {
          new ManifestParser().parse(manifestRaw);
        } catch (e) {
          throw new Error(`Connector "${name}": declarative manifest is invalid — ${e.message}`);
        }
      }

      // Declarative connectors contribute no JS files; JS connectors glob their files.
      const files = hasSource
        ? await glob('**/*.js', { cwd: connectorPath, ignore: ['**/node_modules/**'] })
        : [];

      connectors.push({
        name,
        path: dir,
        files: files.map(f => path.join(dir, f)),
        manifest,
        isDeclarative,
      });
    }

    return connectors;
  }

  // Discover all storages
  async discoverStorages() {
    const storageDirs = await glob('src/Storages/*/', { cwd: this.rootDir });
    const storages = [];

    for (const dir of storageDirs) {
      const name = path.basename(dir);
      const storagePath = path.join(this.rootDir, dir);

      const files = await glob('**/*.js', {
        cwd: storagePath,
        ignore: ['**/node_modules/**'],
      });

      if (files.length === 0) continue;

      let manifest = null;
      if (await fs.pathExists(path.join(storagePath, 'manifest.json'))) {
        manifest = JSON.parse(await fs.readFile(path.join(storagePath, 'manifest.json'), 'utf8'));

        // Convert logo to base64 if it exists
        if (manifest.logo) {
          const logoPath = path.join(storagePath, manifest.logo);
          if (await fs.pathExists(logoPath)) {
            const logoBuffer = await fs.readFile(logoPath);
            const logoExt = path.extname(manifest.logo).toLowerCase();
            const mimeType =
              logoExt === '.png'
                ? 'image/png'
                : logoExt === '.jpg' || logoExt === '.jpeg'
                  ? 'image/jpeg'
                  : logoExt === '.svg'
                    ? 'image/svg+xml'
                    : 'image/png';
            manifest.logo = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
          }
        }
      }

      storages.push({
        name,
        path: dir,
        files: files.map(f => path.join(dir, f)),
        manifest,
      });
    }

    return storages;
  }

  // Extract class names from JavaScript content
  extractClassNames(content) {
    const classNames = [];

    // Remove comments
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // Find class declarations
    const classMatches = cleanContent.matchAll(/(?:^|\s)class\s+([A-Z][a-zA-Z0-9_]*)/gm);
    for (const match of classMatches) {
      classNames.push(match[1]);
    }

    if (classNames.length === 0) {
      // if not found, try to find var-style class declarations
      const varClassMatches = cleanContent.matchAll(
        /(?:^|\s)var\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*class/gm
      );
      for (const match of varClassMatches) {
        classNames.push(match[1]);
      }
    }
    return classNames;
  }

  // Build the main index.js entry file
  async buildIndexEntry() {
    await fs.ensureDir(this.tempDir);

    const connectors = await this.discoverConnectors();
    const storages = await this.discoverStorages();

    console.log(`🔍 Found ${connectors.length} connectors and ${storages.length} storages`);

    let indexContent = '// Auto-generated connector bundle\n\n';

    // 1. Build Core module
    indexContent += await this.buildCoreModule();

    // 2. Build Storage modules
    indexContent += await this.buildStorageModules(storages);

    // 3. Build Connector modules
    indexContent += await this.buildConnectorModules(connectors);

    // 4. Build exports and metadata
    indexContent += this.buildExports(connectors, storages);

    // Write the entry file
    const entryPath = path.join(this.tempDir, 'index.js');
    await fs.writeFile(entryPath, indexContent);

    // Generate manifest
    await this.generateManifest(connectors, storages);

    console.log('✅ Built entry file and manifest');
    return entryPath;
  }

  // Build Core module with all core and constants files
  async buildCoreModule() {
    let content = '// === CORE MODULE ===\n';

    // Get all core files
    const coreFilesRaw = await glob('src/Core/**/*.js', { cwd: this.rootDir });
    // Order so base classes come before subclasses. The bundle is concatenated
    // into a single scope; class declarations are NOT hoisted, so a subclass
    // file processed before its base class hits a temporal dead zone at load.
    const coreFiles = coreFilesRaw.sort((a, b) => {
      const aBase = path.basename(a).startsWith('Abstract') || path.basename(a) === 'BaseEvent.js';
      const bBase = path.basename(b).startsWith('Abstract') || path.basename(b) === 'BaseEvent.js';
      if (aBase && !bBase) return -1;
      if (!aBase && bBase) return 1;
      return a.localeCompare(b);
    });
    const constantFiles = await glob('src/Constants/*.js', { cwd: this.rootDir });
    const configFiles = await glob('src/Configs/**/*.js', { cwd: this.rootDir });

    const allCoreClasses = [];
    const allConstants = [];

    // Process each file - constants first, then core, then configs
    for (const file of [...constantFiles, ...coreFiles, ...configFiles]) {
      const filePath = path.join(this.rootDir, file);
      const fileContent = await fs.readFile(filePath, 'utf8');

      // Extract names from ORIGINAL (pre-strip) content so `export class X` is recognised
      const classNames = this.extractClassNames(fileContent);
      allCoreClasses.push(...classNames);

      // For constants files, also extract constants
      if (file.includes('Constants' + path.sep)) {
        const constantNames = this.extractConstantNames(fileContent);
        allConstants.push(...constantNames);
      }

      // Strip imports/exports for bundle inclusion (Vite concatenates into one scope,
      // so ES module syntax causes duplicate-identifier and duplicate-export errors)
      const processedContent = await this.processEntityFile(fileContent, 'core');

      content += `\n// From ${file}\n`;
      content += processedContent + '\n';
    }

    // Create Core module export
    content += '\n// Core module export\n';
    content += 'const Core = {\n';
    for (const className of allCoreClasses) {
      content += `  ${className},\n`;
    }
    for (const constantName of allConstants) {
      content += `  ${constantName},\n`;
    }
    content += '};\n\n';

    return content;
  }

  // Build all storage modules
  async buildStorageModules(storages) {
    let content = '// === STORAGE MODULES ===\n';

    const allStorages = {};
    const coreClassNames = await this.getCoreClassNames();

    for (const storage of storages) {
      content += `\n// === ${storage.name} Storage ===\n`;
      content += `const ${storage.name} = (function() {\n`;
      content += `  // Isolated scope for ${storage.name}\n`;
      content += `  // Access to Core classes through closure\n`;
      content += `  const { ${Object.keys(coreClassNames).join(', ')} } = Core;\n\n`;

      const storageClasses = [];

      // Process each file in this storage
      for (const file of storage.files) {
        const filePath = path.join(this.rootDir, file);

        if (await fs.pathExists(filePath)) {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const processedContent = await this.processEntityFile(fileContent, storage.name);
          const classNames = this.extractClassNames(fileContent);

          storageClasses.push(...classNames);

          content += `\n  // From ${file}\n`;
          // Indent the content to be inside the IIFE
          const indentedContent = processedContent.replace(/^/gm, '  ');
          content += indentedContent + '\n';
        }
      }

      if (storage.manifest) {
        content += `\n  // Storage manifest\n`;
        content += `  const manifest = ${JSON.stringify(storage.manifest, null, 2)};\n`;
      }

      // Return the public API
      content += `\n  // Export public API\n`;
      content += `  return {\n`;
      for (const className of storageClasses) {
        content += `    ${className},\n`;
      }
      if (storage.manifest) {
        content += `    manifest,\n`;
      }
      content += `  };\n`;
      content += `})();\n`;

      allStorages[storage.name] = storageClasses;
    }

    // Create Storages collection
    content += '\n// All storages collection\n';
    content += 'const Storages = {\n';
    for (const storage of storages) {
      content += `  ${storage.name},\n`;
    }
    content += '};\n\n';

    return content;
  }

  // Build all connector modules
  async buildConnectorModules(connectors) {
    let content = '// === CONNECTOR MODULES ===\n';

    const allConnectors = {};
    const coreClassNames = await this.getCoreClassNames();

    for (const connector of connectors) {
      content += `\n// === ${connector.name} Connector ===\n`;
      content += `const ${connector.name} = (function() {\n`;
      content += `  const { ${Object.keys(coreClassNames).join(', ')} } = Core;\n\n`;

      const connectorClasses = [];

      // 1. Partition files into categories based on their names
      const dependencyFiles = [];
      const schemaFiles = [];
      const classFiles = [];

      for (const file of connector.files) {
        // Using toLowerCase() for a more robust, case-insensitive check
        const fileName = path.basename(file).toLowerCase();
        if (fileName.includes('fieldsschema') || fileName.includes('fieldschema')) {
          schemaFiles.push(file);
        } else if (fileName.includes('source') || fileName.includes('connector')) {
          classFiles.push(file);
        } else {
          dependencyFiles.push(file);
        }
      }

      // 2. Create a single, ordered array of files
      const orderedFiles = [...dependencyFiles, ...schemaFiles, ...classFiles];

      // 3. Process each file in this connector in the correct order
      for (const file of orderedFiles) {
        const filePath = path.join(this.rootDir, file);

        if (await fs.pathExists(filePath)) {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const processedContent = await this.processEntityFile(fileContent, connector.name);
          const classNames = this.extractClassNames(fileContent);

          connectorClasses.push(...classNames);

          content += `\n  // From ${file}\n`;
          // Indent the content to be inside the IIFE
          const indentedContent = processedContent.replace(/^/gm, '  ');
          content += indentedContent + '\n';
        }
      }

      if (connector.manifest) {
        content += `\n  // Connector manifest\n`;
        content += `  const manifest = ${JSON.stringify(connector.manifest, null, 2)};\n`;
      }

      content += `  return {\n`;
      for (const className of connectorClasses) {
        content += `    ${className},\n`;
      }
      if (connector.manifest) {
        content += `    manifest,\n`;
      }
      content += `  };\n`;
      content += `})();\n`;

      allConnectors[connector.name] = connectorClasses;
    }

    content += 'const Connectors = {\n';
    for (const connector of connectors) {
      content += `  ${connector.name},\n`;
    }
    content += '};\n\n';

    return content;
  }

  /**
   * Process entity file to handle imports and dependencies
   * @param {string} content - The content of the entity file
   * @param {string} connectorName - The name of the connector
   * @returns {string} The processed content
   */
  async processEntityFile(content, connectorName) {
    // Remove any existing imports/exports since we're bundling.
    // Vite concatenates these files into a single scope, so ES module syntax
    // produces duplicate-identifier and duplicate-export errors.
    let processedContent = content
      // Drop import statements (single-line and multi-line `import { ... } from '...'`)
      .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      // Drop bare side-effect imports like `import './foo.js';`
      .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
      // Drop any remaining single-line import lines (legacy fallback)
      .replace(/^import\s+.*$/gm, '')
      // Drop re-exports like `export { X } from './X.js';` and `export * from './X.js';`
      .replace(/^export\s*\*\s+from\s+.*$/gm, '')
      .replace(/^export\s*\{[\s\S]*?\}\s*from\s+.*$/gm, '')
      // Drop bare named exports like `export { X };` (no `from`)
      .replace(/^export\s*\{[\s\S]*?\}\s*;?\s*$/gm, '')
      // Strip the `export` (and optional `default`) keyword while preserving
      // the declaration that follows: `export class X` -> `class X`,
      // `export const X = ...` -> `const X = ...`, etc.
      .replace(/^export\s+default\s+/gm, '')
      .replace(/^export\s+(?=(?:class|function|const|let|var|async)\b)/gm, '')
      // Drop CommonJS exports
      .replace(/module\.exports\s*=.*$/gm, '');

    return processedContent;
  }

  /**
   * Get core class names for dependency injection by dynamically scanning core files
   * @returns {Object} The core class names mapped to themselves
   */
  async getCoreClassNames() {
    const coreClasses = {};

    // Get all core files
    const coreFiles = await glob('src/Core/**/*.js', { cwd: this.rootDir });
    const constantFiles = await glob('src/Constants/*.js', { cwd: this.rootDir });

    // Process each core file to extract class names
    for (const file of [...coreFiles, ...constantFiles]) {
      const filePath = path.join(this.rootDir, file);

      if (await fs.pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const classNames = this.extractClassNames(fileContent);

        // Add each class name to the collection
        for (const className of classNames) {
          coreClasses[className] = className;
        }

        // For constants files, also extract object/variable names
        if (file.includes('Constants' + path.sep)) {
          const constantNames = this.extractConstantNames(fileContent);
          for (const constantName of constantNames) {
            coreClasses[constantName] = constantName;
          }
        }
      }
    }

    return coreClasses;
  }

  /**
   * Extract constant/variable names from JavaScript content
   * @param {string} content - The file content
   * @returns {Array} Array of constant names
   */
  extractConstantNames(content) {
    const constantNames = [];

    // Remove comments
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // Find var/const/let declarations
    const varMatches = cleanContent.matchAll(/(?:^|\s)(?:var|const|let)\s+([A-Z_][A-Z0-9_]*)/gm);
    for (const match of varMatches) {
      constantNames.push(match[1]);
    }

    return constantNames;
  }

  // Build exports section
  buildExports(connectors, storages) {
    let content = '// === EXPORTS ===\n\n';

    // Available lists
    content += 'const AvailableConnectors = [\n';
    for (const connector of connectors) {
      content += `  '${connector.name}',\n`;
    }
    content += '];\n\n';

    content += 'const AvailableStorages = [\n';
    for (const storage of storages) {
      content += `  '${storage.name}',\n`;
    }
    content += '];\n\n';

    // Main export object
    content += 'const OWOX = {\n';
    content += '  Core,\n';
    content += '  Connectors,\n';
    content += '  Storages,\n';
    content += '  AvailableConnectors,\n';
    content += '  AvailableStorages,\n\n';

    // Individual connector exports
    content += '  // Individual connectors\n';
    for (const connector of connectors) {
      content += `  ${connector.name},\n`;
    }

    content += '\n  // Individual storages\n';
    for (const storage of storages) {
      content += `  ${storage.name},\n`;
    }

    content += '};\n\n';

    // ES6 and CommonJS exports
    content += '// Export for both ES6 and CommonJS\n';
    content += 'if (typeof module !== "undefined" && module.exports) {\n';
    content += '  module.exports = OWOX;\n';
    content += '  module.exports.Core = Core;\n';
    content += '  module.exports.Connectors = Connectors;\n';
    content += '  module.exports.Storages = Storages;\n';
    content += '  module.exports.AvailableConnectors = AvailableConnectors;\n';
    content += '  module.exports.AvailableStorages = AvailableStorages;\n';
    content += '}\n';
    content += 'if (typeof window !== "undefined") {\n';
    content += '  window.OWOX = OWOX;\n';
    content += '  window.Core = Core;\n';
    content += '  window.Connectors = Connectors;\n';
    content += '  window.Storages = Storages;\n';
    content += '  window.AvailableConnectors = AvailableConnectors;\n';
    content += '  window.AvailableStorages = AvailableStorages;\n';
    content += '}\n';

    return content;
  }

  // Generate manifest.json
  async generateManifest(connectors, storages) {
    const manifest = {
      version: '1.0.0',
      buildDate: new Date().toISOString(),
      connectors: connectors.map(c => ({
        name: c.name,
        files: c.files,
        hasHelper: c.hasHelper,
        hasConnector: c.hasConnector,
        apiReferenceFiles: c.apiReferenceFiles,
        constantFiles: c.constantFiles,
      })),
      storages: storages.map(s => ({
        name: s.name,
        files: s.files,
        hasConfig: s.hasConfig,
        hasStorage: s.hasStorage,
      })),
      totals: {
        connectors: connectors.length,
        storages: storages.length,
        totalFiles:
          connectors.reduce((sum, c) => sum + c.files.length, 0) +
          storages.reduce((sum, s) => sum + s.files.length, 0),
      },
    };

    await fs.writeJSON(path.join(this.tempDir, 'manifest.json'), manifest, { spaces: 2 });
    console.log('✅ Generated manifest.json');
  }
}

// Export Vite configuration
export default defineConfig({
  esbuild: {
    // esbuild >=0.28 errors when lowering some destructuring patterns for the Safari 14 target
    // workaround. The bundled connector code targets Node/modern runtimes that support destructuring
    // natively, so tell esbuild not to transform it. Pinned via the root `esbuild` override
    // (GHSA-gv7w-rqvm-qjhr).
    supported: {
      destructuring: true,
    },
  },
  build: {
    lib: {
      entry: {
        index: 'build/index.js',
        'connector-runner': 'src/connector-runner.js',
      },
      name: 'ConnectorBundle',
      formats: ['cjs', 'es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: [
        // Node builtins must stay external. Without this, vite's lib build
        // resolves a `node:*` specifier to its browser-externals stub, whose
        // members are all undefined -- so `import('node:dns/promises')` yielded
        // a module whose `lookup` was not a function. SsrfGuard's DNS
        // resolve-and-validate check is the only consumer today, and it failed
        // exactly that way. A pattern (not a single entry) so the next Core file
        // to need a builtin does not rediscover this.
        /^node:/,
        '@owox/connectors',
        'adm-zip',
        '@google-cloud/bigquery',
        '@aws-sdk/client-athena',
        '@aws-sdk/client-s3',
        '@aws-sdk/lib-storage',
        'snowflake-sdk',
      ],
      output: {
        preserveModules: false,
      },
      watch: {
        exclude: ['dist/**', 'build/**', 'node_modules/**'],
        include: ['src/**/*.js'],
        buildDelay: 500,
      },
    },
  },
  plugins: [
    {
      name: 'connector-builder',
      enforce: 'pre',
      async buildStart() {
        const builder = new ConnectorBuilder();
        await builder.buildIndexEntry();
      },
      async buildEnd() {
        if (process.argv.includes('--watch')) {
          console.log('👀 Watching for file changes...');
        }
      },
    },
  ],
});
